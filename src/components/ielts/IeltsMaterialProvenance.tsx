import React from 'react';
export default function IeltsMaterialProvenance({label}:{label?:string|null}) {
  if (!label?.startsWith('Variant of ')) return null;
  return <span className="mt-1 block text-sm font-medium">{label}</span>;
}
