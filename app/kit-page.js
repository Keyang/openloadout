// Kits became bundles. Addresses from before keep working: this says where each one leads now.
//   #/kits        -> #/bundles          (the list of bundles)
//   #/kit/<id>    -> #/bundle/<id>      (the bundle that took the kit's place; ids did not change)
const ID = /^[a-z0-9][a-z0-9-]*$/;

/** The new address for an old kit address (the parts after "#/"), or null when it is not one. */
export function kitAddress(parts) {
  const [a, b] = parts;
  if (a === 'kits') return '#/bundles';
  if (a === 'kit') return b && ID.test(b) ? `#/bundle/${b}` : '#/bundles';
  return null;
}
