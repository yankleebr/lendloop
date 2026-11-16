import { ImageResponse } from "next/og";
import {
  BRAND_INDIGO,
  BRAND_PERIWINKLE,
  LOGO_PARTS,
  LOGO_VIEWBOX,
  TILE_STROKE,
} from "@/components/brand/logo-paths";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** Full-bleed periwinkle square (iOS rounds the corners) with the indigo mark, same as the favicon. */
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: BRAND_PERIWINKLE,
        }}
      >
        <svg width="120" height="120" viewBox={LOGO_VIEWBOX} fill="none">
          {LOGO_PARTS.flatMap(({ arc, head }) => [
            <path key={arc} d={arc} stroke={BRAND_INDIGO} strokeWidth={TILE_STROKE} strokeLinecap="round" />,
            <path key={head} d={head} fill={BRAND_INDIGO} />,
          ])}
        </svg>
      </div>
    ),
    size,
  );
}
