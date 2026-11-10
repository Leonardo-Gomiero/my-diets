export function whatsappUrl(phone) {
  if (typeof phone !== 'string' || !phone.trim()) {
    return null;
  }

  let digits = phone.replace(/\D/g, '');
  if (!phone.trim().startsWith('+') && (digits.length === 10 || digits.length === 11)) {
    digits = `55${digits}`;
  }

  if (digits.length < 8 || digits.length > 15) {
    return null;
  }

  return `https://wa.me/${digits}`;
}
