import { Avatar, Inline, Stack, Surface } from "propulse";

const photoDataUri =
  "data:image/svg+xml," +
  encodeURIComponent(
    "<svg xmlns='http://www.w3.org/2000/svg' width='96' height='96'>" +
      "<rect width='96' height='96' fill='#1c2430'/>" +
      "<circle cx='48' cy='40' r='20' fill='#8fa3b3'/>" +
      "<rect x='16' y='64' width='64' height='28' rx='14' fill='#3a4b5c'/>" +
      "</svg>",
  );

export function Roster() {
  return (
    <Surface>
      <Stack>
        <Inline>
          <Avatar name="Alex Rivera" />
          <div>
            <strong>Alex Rivera</strong>
            <p className="su-hint">N0CALL &middot; Station owner</p>
          </div>
        </Inline>
        <Inline>
          <Avatar name="Priya Shah" />
          <div>
            <strong>Priya Shah</strong>
            <p className="su-hint">W1AW &middot; Contest operator</p>
          </div>
        </Inline>
      </Stack>
    </Surface>
  );
}

export function WithPhoto() {
  return (
    <Surface>
      <Inline>
        <Avatar name="Diego Fuentes" src={photoDataUri} />
        <div>
          <strong>Diego Fuentes</strong>
          <p className="su-hint">DL2ABC &middot; JO31 &middot; Portable ops</p>
        </div>
      </Inline>
    </Surface>
  );
}
