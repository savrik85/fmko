// Vykreslí vzor dresu na 2D canvas (pro Three.js CanvasTexture).
// Vzory zrcadlí JerseyPreview SVG komponentu.

export type JerseyPattern = "solid" | "stripes" | "hoops" | "halves" | "sash" | "sleeves" | "chest_band" | "pinstripes" | "quarters" | "gradient";

export function drawJerseyPattern(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  primary: string,
  secondary: string,
  pattern: JerseyPattern
): void {
  ctx.fillStyle = primary;
  ctx.fillRect(0, 0, width, height);

  switch (pattern) {
    case "solid":
      break;

    case "stripes": {
      const stripeW = width / 8;
      ctx.fillStyle = secondary;
      for (let i = 1; i < 8; i += 2) ctx.fillRect(i * stripeW, 0, stripeW, height);
      break;
    }

    case "hoops": {
      const hoopH = height / 10;
      ctx.fillStyle = secondary;
      for (let i = 1; i < 10; i += 2) ctx.fillRect(0, i * hoopH, width, hoopH);
      break;
    }

    case "halves":
      ctx.fillStyle = secondary;
      ctx.fillRect(width / 2, 0, width / 2, height);
      break;

    case "sash":
      ctx.fillStyle = secondary;
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      ctx.moveTo(width * 0.2, 0);
      ctx.lineTo(width * 0.65, 0);
      ctx.lineTo(width, height * 0.7);
      ctx.lineTo(width, height);
      ctx.lineTo(width * 0.55, height);
      ctx.lineTo(0, height * 0.3);
      ctx.lineTo(0, 0);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 1;
      break;

    case "sleeves":
      ctx.fillStyle = secondary;
      ctx.fillRect(0, 0, width * 0.18, height);
      ctx.fillRect(width * 0.82, 0, width * 0.18, height);
      break;

    case "chest_band":
      ctx.fillStyle = secondary;
      ctx.fillRect(0, height * 0.36, width, height * 0.14);
      break;

    case "pinstripes": {
      const pinW = width / 20;
      ctx.fillStyle = secondary;
      for (let i = 0; i < 20; i++) {
        ctx.fillRect(i * pinW + pinW * 0.8, 0, pinW * 0.2, height);
      }
      break;
    }

    case "quarters":
      ctx.fillStyle = secondary;
      ctx.fillRect(width / 2, 0, width / 2, height * 0.4);
      ctx.fillRect(0, height * 0.4, width / 2, height * 0.6);
      break;

    case "gradient": {
      const grad = ctx.createLinearGradient(0, 0, 0, height);
      grad.addColorStop(0, primary);
      grad.addColorStop(1, secondary);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);
      break;
    }
  }
}

export function drawJerseyWithSponsor(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  primary: string,
  secondary: string,
  pattern: JerseyPattern,
  sponsor: string | null
): void {
  drawJerseyPattern(ctx, width, height, primary, secondary, pattern);

  if (sponsor) {
    // Sponsor box uprostřed hrudníku
    const c = primary.replace("#", "");
    const r = parseInt(c.substring(0, 2), 16);
    const g = parseInt(c.substring(2, 4), 16);
    const b = parseInt(c.substring(4, 6), 16);
    const isLight = (r * 299 + g * 587 + b * 114) / 1000 > 160;
    const textColor = isLight ? "#1a1a1a" : "#ffffff";
    const boxBg = isLight ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.18)";

    const fontSize = Math.max(18, Math.floor(width / 18));
    ctx.font = `bold ${fontSize}px system-ui, -apple-system, sans-serif`;
    const text = sponsor.toUpperCase();
    const metrics = ctx.measureText(text);
    const padX = fontSize * 0.6;
    const padY = fontSize * 0.35;
    const boxW = metrics.width + padX * 2;
    const boxH = fontSize + padY * 2;
    const boxX = width / 2 - boxW / 2;
    const boxY = height * 0.46;

    ctx.fillStyle = boxBg;
    ctx.beginPath();
    const radius = boxH / 4;
    ctx.moveTo(boxX + radius, boxY);
    ctx.lineTo(boxX + boxW - radius, boxY);
    ctx.quadraticCurveTo(boxX + boxW, boxY, boxX + boxW, boxY + radius);
    ctx.lineTo(boxX + boxW, boxY + boxH - radius);
    ctx.quadraticCurveTo(boxX + boxW, boxY + boxH, boxX + boxW - radius, boxY + boxH);
    ctx.lineTo(boxX + radius, boxY + boxH);
    ctx.quadraticCurveTo(boxX, boxY + boxH, boxX, boxY + boxH - radius);
    ctx.lineTo(boxX, boxY + radius);
    ctx.quadraticCurveTo(boxX, boxY, boxX + radius, boxY);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = textColor;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, width / 2, boxY + boxH / 2);
  }
}
