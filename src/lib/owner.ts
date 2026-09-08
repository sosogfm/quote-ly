/** Contas com acesso à Central de Evolução e configurações avançadas. */
export const OWNER_EMAILS = [
  "sofiademello33@gmail.com",
  "sofiademelloifc@gmail.com",
];

export function isOwnerEmail(email?: string | null) {
  if (!email) return false;
  return OWNER_EMAILS.includes(email.trim().toLowerCase());
}
