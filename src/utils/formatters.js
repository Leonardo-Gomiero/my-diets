export function formatLocation(city) {
  return city.trim().replace(/\b\w/g, (letter) => letter.toUpperCase());
}
