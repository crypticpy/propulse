import { Field, Stack, Surface } from "propulse";

export function NativeControl() {
  return (
    <Surface>
      <Field
        label="Output power"
        hint="Slide to set the power level for this operating session."
      >
        {(control) => (
          <input
            {...control}
            type="range"
            min={5}
            max={100}
            step={5}
            defaultValue={100}
            className="su-input"
          />
        )}
      </Field>
    </Surface>
  );
}

export function WithError() {
  return (
    <Surface>
      <Stack>
        <Field label="Grid square" required error="Enter a valid 4 or 6 character grid square.">
          {(control) => (
            <input
              {...control}
              type="text"
              defaultValue="EM1"
              className="su-input"
            />
          )}
        </Field>
      </Stack>
    </Surface>
  );
}
