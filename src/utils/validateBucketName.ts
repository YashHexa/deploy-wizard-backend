const IPV4_PATTERN = /^(\d{1,3}\.){3}\d{1,3}$/;
const VALID_CHARS_PATTERN = /^[a-z0-9.-]+$/;
const LABEL_START_END_PATTERN = /^[a-z0-9].*[a-z0-9]$/;

export function validateBucketNameFormat(name: string): string[] {
  const errors: string[] = [];

  if (!name) {
    return ["Bucket name is required."];
  }

  if (name.length < 3 || name.length > 63) {
    errors.push("Must be between 3 and 63 characters long.");
  }
  if (!VALID_CHARS_PATTERN.test(name)) {
    errors.push("Can only contain lowercase letters, numbers, hyphens, and periods.");
  }
  if (name.length >= 1 && !LABEL_START_END_PATTERN.test(name)) {
    errors.push("Must start and end with a lowercase letter or number.");
  }
  if (name.includes("..")) {
    errors.push("Cannot contain consecutive periods.");
  }
  if (name.includes(".-") || name.includes("-.")) {
    errors.push("Cannot have a period adjacent to a hyphen.");
  }
  if (IPV4_PATTERN.test(name)) {
    errors.push("Cannot be formatted as an IP address.");
  }
  if (name.startsWith("xn--")) {
    errors.push('Cannot start with the reserved prefix "xn--".');
  }
  if (name.endsWith("-s3alias")) {
    errors.push('Cannot end with the reserved suffix "-s3alias".');
  }

  return errors;
}
