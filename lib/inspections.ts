import { Property, PropertyUnit, InspectionRoutine, InspectionAnswer, QuestionScope } from './types';

export interface QuestionTarget {
  scope: QuestionScope;
  label: string; // "Room 2", "Kitchen 1", "Whole property"
}

// Walk a property structure and produce the list of targets for each scope.
export function targetsForProperty(p: Property): QuestionTarget[] {
  const targets: QuestionTarget[] = [];

  const add = (scope: QuestionScope, label: string) => targets.push({ scope, label });

  add('property', 'Whole property');
  add('exterior', 'Exterior');

  const walk = (unit: PropertyUnit, trail: string) => {
    const label = trail ? `${trail} — ${unit.label}` : unit.label;
    add('unit', label);
    if (unit.kind === 'bedroom' || unit.kind === 'hmo-room' || unit.kind === 'studio') {
      add('bedroom', label);
    }
    for (let k = 1; k <= (unit.kitchens || 0); k++) add('kitchen', `${label} — Kitchen ${unit.kitchens > 1 ? k : ''}`.trim());
    for (let b = 1; b <= (unit.bathrooms || 0); b++) add('bathroom', `${label} — Bathroom ${unit.bathrooms > 1 ? b : ''}`.trim());
    if (unit.ensuite) add('bathroom', `${label} — Ensuite`);
    unit.children.forEach((c) => walk(c, label));
  };

  p.units.forEach((u) => walk(u, ''));

  for (let k = 1; k <= (p.kitchens || 0); k++) add('kitchen', `Kitchen ${p.kitchens > 1 ? k : ''}`.trim());
  for (let b = 1; b <= (p.bathrooms || 0); b++) add('bathroom', `Bathroom ${p.bathrooms > 1 ? b : ''}`.trim());

  const hasCommunal = p.type === 'HMO' || p.type === 'Flats' || p.units.length > 1;
  if (hasCommunal) add('communal', 'Communal areas');

  return targets;
}

// Build the answer list for a routine run against a property.
export function buildQuestionnaire(p: Property, routine: InspectionRoutine): InspectionAnswer[] {
  const targets = targetsForProperty(p);
  const answers: InspectionAnswer[] = [];
  for (const q of routine.questions) {
    const matching = targets.filter((t) => t.scope === q.scope);
    for (const t of matching) {
      answers.push({
        questionId: q.id,
        questionText: q.text,
        answerType: q.answerType,
        scope: q.scope,
        targetLabel: t.label,
        value: '',
        options: q.options,
      });
    }
  }
  return answers;
}

export function scopeLabel(scope: QuestionScope): string {
  const map: Record<QuestionScope, string> = {
    property: 'Whole property',
    exterior: 'Exterior',
    unit: 'Every unit',
    bedroom: 'Every bedroom / room',
    kitchen: 'Every kitchen',
    bathroom: 'Every bathroom',
    communal: 'Communal areas',
  };
  return map[scope];
}

export function answerTypeLabel(t: string): string {
  const map: Record<string, string> = {
    text: 'Entry box',
    yesno: 'Yes / No',
    multi: 'Multiple choice',
    number: 'Number',
    rating: 'Rating 1–5',
  };
  return map[t] || t;
}
