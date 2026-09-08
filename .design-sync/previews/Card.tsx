import { Card, Stack } from "propulse";

export function Variants() {
  return (
    <Stack>
      <Card>
        <p className="text-sm text-su-text">
          IC-7300 on 20 m, working DL2ABC at 59.
        </p>
      </Card>
      <Card variant="highlight">
        <p className="text-sm text-su-text">
          SFI 142, Kp 3 — band conditions look excellent for DX.
        </p>
      </Card>
      <Card variant="alert">
        <p className="text-sm text-su-text">
          X-ray flare C2.1 in progress — HF absorption possible.
        </p>
      </Card>
    </Stack>
  );
}

export function DialogSurface() {
  return (
    <Card surface="dialog" variant="highlight">
      <p className="text-sm text-su-text">
        Confirm: log QSO with VK6LC on 40 m, FT8, grid OF78.
      </p>
    </Card>
  );
}
