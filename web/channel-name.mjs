// Only compact device labels here; channel display names are supplied by the host.
export function compactInputLabel(label) {
  const match = /^(?:(?:virtual\s+)?(rec)|(?:analog\s+)?in(?:put)?)\s+(\d+(?:\/\d+)?)(?=\s*(?:$|·|\(|（))/i.exec(label);
  return match ? `${match[1] ? "Rec" : "In"} ${match[2]}` : label;
}

export function compactOutputLabel(label) {
  const match = /^(?:(?:analog\s+)?out(?:put)?|(playback)|virtual\s+(play))\s+(\d+(?:\/\d+)?)(?=\s*(?:$|·|\(|（))/i.exec(label);
  if (!match) return label;
  const prefix = match[1] ? "BACK" : match[2] ? "Play" : "Out";
  return `${prefix} ${match[3]}`;
}
