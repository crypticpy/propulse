import { ImagePicker, Surface } from "propulse";

const photoDataUri =
  "data:image/svg+xml," +
  encodeURIComponent(
    "<svg xmlns='http://www.w3.org/2000/svg' width='200' height='150'>" +
      "<rect width='200' height='150' fill='#1c2430'/>" +
      "<rect x='20' y='40' width='160' height='70' rx='6' fill='#3a4b5c'/>" +
      "<circle cx='55' cy='75' r='18' fill='#ff6b35'/>" +
      "<rect x='90' y='55' width='70' height='10' fill='#8fa3b3'/>" +
      "<rect x='90' y='75' width='70' height='10' fill='#8fa3b3'/>" +
      "</svg>",
  );

export function Empty() {
  return (
    <Surface>
      <ImagePicker label="Equipment photo" onChange={() => {}} />
    </Surface>
  );
}

export function WithPreview() {
  return (
    <Surface>
      <ImagePicker
        label="Equipment photo"
        previewUrl={photoDataUri}
        fileName="ic-7300-front.jpg"
        onChange={() => {}}
      />
    </Surface>
  );
}
