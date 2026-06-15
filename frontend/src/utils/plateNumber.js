const arabicDigitMap = new Map([
  ["٠", "0"],
  ["١", "1"],
  ["٢", "2"],
  ["٣", "3"],
  ["٤", "4"],
  ["٥", "5"],
  ["٦", "6"],
  ["٧", "7"],
  ["٨", "8"],
  ["٩", "9"],
  ["۰", "0"],
  ["۱", "1"],
  ["۲", "2"],
  ["۳", "3"],
  ["۴", "4"],
  ["۵", "5"],
  ["۶", "6"],
  ["۷", "7"],
  ["۸", "8"],
  ["۹", "9"],
]);

const normalizeArabicLetter = (char) =>
  ({
    ا: "أ",
    إ: "أ",
    آ: "أ",
    ٱ: "أ",
    ى: "ي",
    ة: "ه",
  })[char] || char;

export const compactPlateNumber = (value) => {
  if (value === undefined || value === null) return "";

  return Array.from(String(value).normalize("NFKC").trim())
    .map((char) => arabicDigitMap.get(char) || normalizeArabicLetter(char).toUpperCase())
    .filter((char) => /[0-9A-Z]/.test(char) || /\p{Script=Arabic}/u.test(char))
    .join("");
};

export const normalizePlateNumber = (value) => {
  const compact = compactPlateNumber(value);
  if (!compact) return "";

  const letters = [];
  const digits = [];

  Array.from(compact).forEach((char) => {
    if (/[0-9]/.test(char)) {
      digits.push(char);
    } else {
      letters.push(char);
    }
  });

  const letterText = letters.join(" ");
  const digitText = digits.join(" ");

  if (letterText && digitText) return `${letterText} - ${digitText}`;
  return letterText || digitText;
};
