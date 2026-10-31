export const LAYOUT = {
    version: "bh-bubbles-v1",
    width: 1000,
    height: 1414,
    capacity: 40,
    radius: 12,
    qr: { x: 750, y: 95, size: 180 },
    markers: [
        { x: 45, y: 45 },
        { x: 955, y: 45 },
        { x: 955, y: 1369 },
        { x: 45, y: 1369 },
    ],
};
export const bubblePosition = (row, choice) => ({
    x: (row < 20 ? 210 : 650) + choice * 48,
    y: 395 + (row % 20) * 39,
});
export const rowLabelPosition = (row) => ({
    x: row < 20 ? 125 : 565,
    y: bubblePosition(row, 0).y,
});
export const QR_PREFIX = "BH1:";
export function parseSheetToken(text) {
    if (!/^BH1:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(text))
        throw new Error("This is not a Brains Heist answer sheet.");
    return text.slice(QR_PREFIX.length).toLowerCase();
}
export const guestBookletCode = (guestId, number) => `G${String(number).padStart(3, "0")}-${guestId.slice(0, 6).toUpperCase()}`;
/** Equal-width preview cells keep every photographed bubble over its answer button. */
export const bubblePreviewRegion = (row, choiceCount) => {
    const first = bubblePosition(row, 0);
    return { x: first.x - 24, y: first.y - 19, width: choiceCount * 48, height: 38 };
};
