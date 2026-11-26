export const later = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const frame = () => later(30);
