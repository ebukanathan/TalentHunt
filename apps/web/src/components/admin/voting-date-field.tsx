"use client";

import { useRef } from "react";

export function VotingDateField({
  id,
  label,
  value,
  onChange,
  disabled,
  required,
  invalid,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  required: boolean;
  invalid: boolean;
}) {
  const dateInput = useRef<HTMLInputElement>(null);
  const [date = "", time = ""] = value.split("T");
  const [hour = "", minute = ""] = time.split(":");
  const needsBoth = required || Boolean(date || time);

  function update(nextDate: string, nextTime: string) {
    onChange(nextDate || nextTime ? `${nextDate}T${nextTime}` : "");
  }

  return (
    <fieldset className="admin-voting-date" disabled={disabled}>
      <legend>{label} (Africa/Lagos)</legend>
      <div className="admin-field">
        <label htmlFor={id}>Date</label>
        <div className="admin-date-picker">
          <input
            ref={dateInput}
            id={id}
            type="date"
            value={date}
            required={needsBoth}
            aria-invalid={invalid}
            onChange={event => update(event.target.value, time)}
          />
          <button
            type="button"
            className="admin-button admin-button-secondary"
            aria-label={`Choose ${label.toLowerCase()} date`}
            onClick={() => {
              const input = dateInput.current;
              if (!input) return;
              input.focus();
              try {
                input.showPicker?.();
              } catch {
                // The focused native field remains usable when a picker is unavailable.
              }
            }}
          >
            Choose date
          </button>
        </div>
      </div>
      <div className="admin-field" role="group" aria-labelledby={`${id}-time-label`}>
        <span id={`${id}-time-label`} className="admin-time-label">Time (Lagos, 24-hour)</span>
        <div className="admin-time-picker">
          <div className="admin-field">
            <label htmlFor={`${id}-hour`}>Hour</label>
            <select
              id={`${id}-hour`}
              value={hour}
              required={needsBoth}
              aria-invalid={invalid}
              onChange={event => {
                const nextHour = event.target.value;
                const nextMinute = minute || (nextHour ? "00" : "");
                update(date, nextHour || nextMinute ? `${nextHour}:${nextMinute}` : "");
              }}
            >
              <option value="">Choose hour</option>
              {Array.from({ length: 24 }, (_, index) => {
                const option = String(index).padStart(2, "0");
                return <option key={option} value={option}>{option}</option>;
              })}
            </select>
          </div>
          <div className="admin-field">
            <label htmlFor={`${id}-minute`}>Minute</label>
            <select
              id={`${id}-minute`}
              value={minute}
              required={needsBoth}
              aria-invalid={invalid}
              onChange={event => {
                const nextMinute = event.target.value;
                update(date, hour || nextMinute ? `${hour}:${nextMinute}` : "");
              }}
            >
              <option value="">Choose minute</option>
              {Array.from({ length: 60 }, (_, index) => {
                const option = String(index).padStart(2, "0");
                return <option key={option} value={option}>{option}</option>;
              })}
            </select>
          </div>
        </div>
      </div>
    </fieldset>
  );
}
