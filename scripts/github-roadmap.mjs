import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dir = resolve(root, 'docs/project-management');
const generated = resolve(dir, 'generated');
mkdirSync(generated, { recursive: true });
const plan = JSON.parse(readFileSync(resolve(dir, 'backlog.json'), 'utf8').replace(/^\uFEFF/, ''));
const roadmap = readFileSync(resolve(dir, 'roadmap.md'), 'utf8');
const args = process.argv.slice(2);
if (args.some(x => !['--plan', '--apply'].includes(x)) || (args.includes('--plan') && args.includes('--apply'))) {
  throw new Error('Usage: node scripts/github-roadmap.mjs [--plan | --apply]');
}
const apply = args.includes('--apply');
const commandLog = [];
const keys = new Set(plan.issues.map(x => x.key));
if (keys.size !== plan.issues.length) throw new Error('Duplicate issue keys');
for (const issue of plan.issues) {
  if (!plan.phases[issue.phase - 1] || !issue.acceptance.length ||
      !['P0', 'P1', 'P2'].includes(issue.priority) ||
      !['Backlog', 'Next', 'In Progress', 'Done'].includes(issue.status)) throw new Error('Invalid issue: ' + issue.key);
  if (issue.dependencies.some(x => !keys.has(x))) throw new Error('Unknown dependency: ' + issue.key);
  if (issue.status === 'Done' && !issue.evidence.length) throw new Error('Done without evidence');
}
if (plan.issues.filter(x => x.status === 'Next').length > 1) throw new Error('Solo roadmap permits at most one Next issue');
const ordered = [];
const pending = [...plan.issues];
while (pending.length) {
  const index = pending.findIndex(x => x.dependencies.every(k => ordered.some(y => y.key === k)));
  if (index < 0) throw new Error('Dependency cycle');
  ordered.push(...pending.splice(index, 1));
}
function quote(x) { return "'" + String(x).replaceAll("'", "''") + "'"; }
function gh(argv, fallback = '') {
  commandLog.push('gh ' + argv.map(quote).join(' '));
  if (!apply) return typeof fallback === 'string' ? fallback : JSON.stringify(fallback);
  console.log('gh ' + argv.slice(0, 3).join(' '));
  const result = spawnSync('gh', argv.map(String), { cwd: root, encoding: 'utf8', timeout: 120000 });
  if (result.error || result.status !== 0) throw new Error((result.stderr || result.stdout || result.error?.message || 'gh failed').trim());
  return result.stdout.trim();
}
function json(argv, fallback) { return JSON.parse(gh(argv, fallback)); }
function save(name, value) {
  const path = resolve(generated, name);
  writeFileSync(path, typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n', 'utf8');
  return relative(root, path).replaceAll('\\', '/');
}
function graphql(name, query, variables, fallback) {
  return json(['api', 'graphql', '--input', save(name + '.json', { query, variables })], fallback);
}
function readProjectFields(projectNumber, fallback) {
  const response = graphql('read-fields',
    'query($owner:String!,$number:Int!){user(login:$owner){projectV2(number:$number){fields(first:50){nodes{... on ProjectV2SingleSelectField{id name options{id name}}}}}}}',
    {owner:plan.owner,number:apply ? projectNumber : 0},
    {data:{user:{projectV2:{fields:{nodes:fallback.fields}}}}});
  return {fields:response.data.user.projectV2.fields.nodes.filter(x=>x.name)};
}
function body(issue, links = {}) {
  const dependencyLines = [
    ...issue.dependencies.map(k => '- Depends on ' + (links[k] ? '[' + k + '](' + links[k] + ')' : k) + '.'),
    ...(issue.externalDependencies ?? []).map(url => '- Depends on ' + url + '.'),
  ];
  const dependencies = dependencyLines.length
    ? dependencyLines.join('\n')
    : '- None.';
  return '# ' + issue.key + ': ' + issue.title + '\n\n' +
    issue.description + '\n\n' +
    '**Phase:** ' + plan.phases[issue.phase - 1].name + '\n\n' +
    '**Priority:** ' + issue.priority + '\n\n**Initial status:** ' + issue.status + '\n\n' +
    '**Labels:** ' + issue.labels.join(', ') + '\n\n## Acceptance criteria\n\n' +
    issue.acceptance.map(x => '- [' + (issue.status === 'Done' ? 'x' : ' ') + '] ' + x).join('\n') +
    '\n\n## Dependencies\n\n' + dependencies +
    '\n\n## Evidence and verification\n\n' +
    (issue.evidence.length ? issue.evidence.map(x => '- ' + x).join('\n') : '- Not implemented in the reviewed source. Attach implementation, test and migration evidence before marking Done.') +
    '\n\n**Review baseline:** ' + plan.reviewedOn + ' (Africa/Lagos). See roadmap.md for current scope and preserved historical evidence.' +
    (issue.sources.length ? '\n\n## References\n\n' + issue.sources.map(x => '- ' + x).join('\n') : '') + '\n';
}
const overview = '# Proposed TalentHunt backlog\n\nNo GitHub changes have been executed by --plan.\n\n' +
  '| Key | Phase | Priority | Status | Dependencies | Issue |\n| --- | --- | --- | --- | --- | --- |\n' +
  plan.issues.map(x => '| ' + x.key + ' | ' + x.phase + ' | ' + x.priority + ' | ' + x.status + ' | ' + (x.dependencies.join(', ') || 'None') + ' | ' + x.title + ' |').join('\n') +
  '\n\n' + plan.issues.map(x => body(x)).join('\n---\n\n');
writeFileSync(resolve(dir, 'proposed-backlog.md'), overview, 'utf8');

try {
  gh(['auth', 'status']);
  const repository = json(['repo', 'view', plan.repository, '--json', 'nameWithOwner,hasIssuesEnabled'],
    { nameWithOwner: plan.repository, hasIssuesEnabled: true });
  if (repository.nameWithOwner.toLowerCase() !== plan.repository.toLowerCase() || !repository.hasIssuesEnabled) throw new Error('Repository mismatch or issues disabled');
  const projectList = json(['project', 'list', '--owner', plan.owner, '--limit', '100', '--format', 'json'], { projects: [], totalCount: 0 });
  if (projectList.totalCount > projectList.projects.length) throw new Error('Project listing truncated; inspect before applying');
  const matches = projectList.projects.filter(x => x.title === plan.projectTitle);
  if (matches.length > 1) throw new Error('Multiple exact-title projects; select one explicitly before applying');
  if (matches[0]?.closed) throw new Error('Matching project is closed');
  const project = matches[0] || json(['project', 'create', '--owner', plan.owner, '--title', plan.projectTitle, '--format', 'json'],
    { number: '<PROJECT_NUMBER>', id: '<PROJECT_ID>', url: '<PROJECT_URL>' });
  const number = String(project.number);
  gh(['project', 'link', number, '--owner', plan.owner, '--repo', plan.repository]);
  gh(['project', 'edit', number, '--owner', plan.owner, '--visibility', 'PRIVATE',
    '--description', 'Solo-developer MVP roadmap: verified foundations, safe paid voting and evidence-based launch.',
    '--readme', roadmap]);
  const fieldResponse = readProjectFields(project.number, {
    fields: [{ id: '<STATUS_FIELD_ID>', name: 'Status', options: [
      { id: '<TODO_OPTION_ID>', name: 'Todo' }, { id: '<PROGRESS_OPTION_ID>', name: 'In Progress' }, { id: '<DONE_OPTION_ID>', name: 'Done' }
    ] }]
  });
  const status = fieldResponse.fields.find(x => x.name === 'Status');
  if (!status?.options) throw new Error('Project Status single-select field missing');
  const names = ['Backlog', 'Next', 'In Progress', 'Done'];
  const colors = ['GRAY', 'BLUE', 'YELLOW', 'GREEN'];
  graphql('status-options',
    'mutation($input:UpdateProjectV2FieldInput!){updateProjectV2Field(input:$input){projectV2Field{... on ProjectV2SingleSelectField{id name options{id name}}}}}',
    { input: { fieldId: status.id, singleSelectOptions: names.map((name, index) => {
      const previous = status.options.find(x => x.name === name || (name === 'Backlog' && x.name === 'Todo'));
      return { ...(previous ? { id: previous.id } : {}), name, color: colors[index], description: [
        'Identified work; check dependencies before selecting.', 'Ready to start; initially database seeding only.',
        'Actively developed; solo work-in-progress limit one.', 'Acceptance and verification evidence recorded; issue completed.'
      ][index] };
    }) } }, { data: {} });
  for (const [name, options] of [
    ['Phase', plan.phases.map(x => x.name)],
    ['Priority', ['P0', 'P1', 'P2']]
  ]) {
    const field = fieldResponse.fields.find(x => x.name === name);
    if (field) {
      if (!field.options || options.some(option => !field.options.some(x => x.name === option))) {
        if(name!=='Phase' || !field.options?.some(x=>x.name==='Testing') || !field.options?.some(x=>x.name==='CI/CD and Deployment')) {
          throw new Error('Existing field options differ for ' + name + '; inspect rather than overwriting');
        }
        graphql('repair-phase-options',
          'mutation($input:UpdateProjectV2FieldInput!){updateProjectV2Field(input:$input){projectV2Field{... on ProjectV2SingleSelectField{id name options{id name}}}}}',
          {input:{fieldId:field.id,singleSelectOptions:options.map((option,index)=>{
            const previous=field.options.find(x=>x.name===option || (option==='Testing, CI/CD and Deployment' && x.name==='Testing'));
            return {...(previous?{id:previous.id}:{}),name:option,color:['BLUE','PURPLE','YELLOW','RED','ORANGE','GREEN'][index],description:plan.phases[index].gate};
          })}}, {data:{}});
      }
    } else {
      json(['project', 'field-create', number, '--owner', plan.owner, '--name', name,
        '--data-type', 'SINGLE_SELECT', '--single-select-options', options.map(option=>'"'+option.replaceAll('"','""')+'"').join(','), '--format', 'json'], { id: '<' + name.toUpperCase() + '_FIELD_ID>' });
    }
  }
  const allFields = readProjectFields(project.number, {fields:[
    {id:'<STATUS_FIELD_ID>',name:'Status',options:names.map(name=>({id:'<STATUS_'+name+'>',name}))},
    {id:'<PHASE_FIELD_ID>',name:'Phase',options:plan.phases.map(x=>({id:'<PHASE_'+x.name+'>',name:x.name}))},
    {id:'<PRIORITY_FIELD_ID>',name:'Priority',options:['P0','P1','P2'].map(name=>({id:'<PRIORITY_'+name+'>',name}))}
  ]});
  const itemSnapshot = json(['project','item-list',number,'--owner',plan.owner,'--limit','1000','--format','json'],{items:[]});
  const views = graphql('read-views',
    'query($owner:String!,$number:Int!){user(login:$owner){projectV2(number:$number){views(first:100){nodes{id name layout}}}}}',
    { owner: plan.owner, number: apply ? project.number : 0 },
    { data: { user: { projectV2: { views: { nodes: [] } } } } }).data.user.projectV2.views.nodes;
  const kanban = views.find(x => x.name === 'Kanban');
  if (kanban && kanban.layout !== 'BOARD_LAYOUT') throw new Error('Existing Kanban view has unexpected layout');
  if (!kanban) graphql('create-kanban',
    'mutation($input:CreateProjectV2ViewInput!){createProjectV2View(input:$input){projectV2View{id name layout}}}',
    { input: { projectId: project.id, name: 'Kanban', layout: 'BOARD_LAYOUT' } }, { data: {} });
  const existingLabels = json(['label', 'list', '--repo', plan.repository, '--limit', '1000', '--json', 'name'], [{ name: 'documentation' }]);
  for (const label of plan.labels) {
    if (!existingLabels.some(x => x.name === label.name)) gh(['label', 'create', label.name, '--repo', plan.repository,
      '--color', label.color, '--description', label.description]);
  }
  if (!existingLabels.some(x => x.name === 'documentation')) throw new Error('Expected documentation label missing; inspect before continuing');
  const milestones = json(['api', 'repos/' + plan.repository + '/milestones?state=all&per_page=100', '--paginate', '--slurp'], []).flat();
  for (const phase of plan.phases) {
    const milestone = milestones.find(x => x.title === phase.name);
    if (milestone?.state === 'closed') throw new Error('Matching milestone is closed: ' + phase.name);
    if (!milestone) json(['api', '--method', 'POST', 'repos/' + plan.repository + '/milestones', '--input',
      save('milestone-' + (plan.phases.indexOf(phase) + 1) + '.json',
        { title: phase.name, description: 'Exit gate: ' + phase.gate + ' Dates will be set after capacity is known.' })], {});
  }
  const existingIssues = json(['issue', 'list', '--repo', plan.repository, '--state', 'all', '--limit', '1000', '--json', 'number,title,state,url'], []);
  if (existingIssues.length === 1000) throw new Error('Issue listing may be truncated');
  const links = {};
  const issueNumbers = {};
  for (const issue of ordered) {
    const title = '[' + issue.key + '] ' + issue.title;
    const matches = existingIssues.filter(x => x.title === title);
    if (matches.length > 1) throw new Error('Duplicate existing issue: ' + title);
    const file = save(issue.key + '.md', body(issue, links));
    const existing = matches[0];
    if (existing && existing.state === 'CLOSED' && issue.status !== 'Done') throw new Error('Existing issue state differs: ' + title);
    // Reruns do not overwrite bodies or reopen issues. Exact-title matches are reused.
    const url = existing?.url || gh(['issue', 'create', '--repo', plan.repository, '--title', title,
      '--body-file', file, '--label', issue.labels.join(','), '--milestone', plan.phases[issue.phase - 1].name],
      'https://github.com/' + plan.repository + '/issues/<ISSUE_' + issue.key + '>');
    links[issue.key] = url.trim();
    issueNumbers[issue.key] = apply ? Number(url.trim().split('/').at(-1)) : '<ISSUE_' + issue.key + '>';
    if (apply && !Number.isSafeInteger(issueNumbers[issue.key])) throw new Error('Unexpected issue URL');
    const savedItem = itemSnapshot.items.find(x=>x.content?.url===links[issue.key]);
    const item = savedItem || json(['project', 'item-add', number, '--owner', plan.owner, '--url', links[issue.key], '--format', 'json'], { id: '<ITEM_' + issue.key + '>' });
    for (const [field, value] of [['Status', issue.status], ['Phase', plan.phases[issue.phase - 1].name], ['Priority', issue.priority]]) {
      if(savedItem?.[field.toLowerCase()]===value) continue;
      const definition=allFields.fields.find(x=>x.name===field);
      const option=definition?.options.find(x=>x.name===value);
      if(!definition||!option)throw new Error('Unknown field option: '+field+'/'+value);
      gh(['project','item-edit','--id',item.id,'--project-id',project.id,'--field-id',definition.id,'--single-select-option-id',option.id]);
    }
    if (issue.status === 'Done' && existing?.state !== 'CLOSED') gh(['issue', 'close', links[issue.key], '--repo', plan.repository, '--reason', 'completed']);
  }
  const finalItems = json(['project', 'item-list', number, '--owner', plan.owner, '--limit', '1000', '--format', 'json'], { items: [] });
  if (apply) {
    for (const issue of plan.issues) {
      const item = finalItems.items.find(x => x.content?.url === links[issue.key]);
      if (!item || item.status !== issue.status || item.phase !== plan.phases[issue.phase - 1].name || item.priority !== issue.priority) {
        throw new Error('Project verification failed for ' + issue.key + '; inspect actual item output before continuing');
      }
    }
    const finalIssues = json(['issue', 'list', '--repo', plan.repository, '--state', 'all', '--limit', '1000', '--json', 'number,state'], []);
    for (const issue of plan.issues) {
      const actual = finalIssues.find(x => x.number === issueNumbers[issue.key]);
      if (!actual || actual.state !== (issue.status === 'Done' ? 'CLOSED' : 'OPEN')) throw new Error('Issue state verification failed: ' + issue.key);
    }
    writeFileSync(resolve(dir, 'created-resources.json'), JSON.stringify({ project, issues: links, reviewedOn: plan.reviewedOn }, null, 2) + '\n');
    console.log('Verified project: ' + project.url);
  }
} finally {
  const path = resolve(dir, apply ? 'execution-commands.txt' : 'commands-preview.ps1');
  writeFileSync(path,
    '# ' + (apply ? 'Commands executed after explicit approval' : 'PROPOSAL ONLY — do not execute before approval') + '\n' +
    '# Run from the repository root. Generated IDs are placeholders in the preview.\n' +
    '# PowerShell-safe quoting is used for review; the runner invokes gh directly with argument arrays.\n' +
    commandLog.join('\n\n') + '\n', 'utf8');
}
if (!apply) console.log('LOCAL PREVIEW ONLY: review docs/project-management/proposed-backlog.md, roadmap.md and commands-preview.ps1. No GitHub requests were made.');
