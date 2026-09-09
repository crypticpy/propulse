import { Badge, Inline } from "propulse";

export function Statuses() {
  return (
    <Inline>
      <Badge status="excellent">Excellent</Badge>
      <Badge status="good">Good</Badge>
      <Badge status="fair">Fair</Badge>
      <Badge status="poor">Poor</Badge>
      <Badge status="quiet">Quiet</Badge>
      <Badge status="active">Active</Badge>
      <Badge status="storm">Storm</Badge>
    </Inline>
  );
}

export function Sizes() {
  return (
    <Inline>
      <Badge status="good" size="sm">
        20 m Good
      </Badge>
      <Badge status="excellent" size="md">
        Excellent DX
      </Badge>
    </Inline>
  );
}
