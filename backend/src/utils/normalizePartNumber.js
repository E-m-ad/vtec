const PART_NUMBER_PATTERN =
  /(?:^|[^A-Z0-9])([A-Z0-9]{5}\s*[-\s]?\s*[A-Z0-9]{5})(?=$|[^A-Z0-9])/;

const cleanPartNumber = (value) =>
  String(value ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");

export const extractPartNumber = (value) => {
  const text = String(value ?? "").trim().toUpperCase();
  const match = text.match(PART_NUMBER_PATTERN);

  return match ? cleanPartNumber(match[1]) : "";
};

export const normalizePartNumber = (value) => {
  const extracted = extractPartNumber(value);
  if (extracted) return extracted;

  return cleanPartNumber(value);
};

export const normalizePartNumberSearch = (value) => {
  const extracted = extractPartNumber(value);

  return extracted || String(value ?? "").trim();
};
