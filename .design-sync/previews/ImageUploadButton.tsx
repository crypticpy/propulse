import { ImageUploadButton, Inline, Surface } from "propulse";

// No stored image exists in this preview's IndexedDB, so the thumbnail
// preview state cannot be shown honestly — both cells show the upload
// trigger, which is the state these props can actually produce.
export function Default() {
  return (
    <Surface>
      <ImageUploadButton
        onImageChange={() => {}}
        aspect={1}
        cropShape="round"
        maxOutputWidth={480}
        maxOutputHeight={480}
        quality={0.85}
        label="Upload station photo"
      />
    </Surface>
  );
}

export function Compact() {
  return (
    <Surface>
      <Inline>
        <ImageUploadButton
          onImageChange={() => {}}
          aspect={4 / 3}
          cropShape="rect"
          maxOutputWidth={640}
          maxOutputHeight={480}
          quality={0.85}
          compact
        />
        <span className="text-sm text-su-muted">IC-7300 photo</span>
      </Inline>
    </Surface>
  );
}
