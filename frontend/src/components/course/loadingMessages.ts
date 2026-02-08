/** Fun loading message pools rotated during AI generation steps. */

export const outcomesMessages = [
  'Analyzing your topic with AI...',
  'Mapping out what learners will achieve...',
  'Crafting meaningful learning outcomes...',
  'Thinking about what success looks like...',
  'Designing the path from novice to expert...',
];

export const personaMessages = [
  'Finding the perfect teacher for your topic...',
  'Assembling a dream team of experts...',
  'Matching expertise to your course goals...',
  'Identifying who knows this stuff inside out...',
  'Creating your subject matter expert profile...',
];

export const courseCreationMessages = [
  'Your course is being crafted by AI...',
  'Building something amazing — hang tight!',
  'Turning your vision into structured lessons...',
  'The AI is in deep focus mode...',
  'Great things take a moment...',
  'Almost there — polishing the details...',
  'Teaching robots to teach humans...',
  'Brewing a fresh pot of knowledge...',
  'Assembling the building blocks of brilliance...',
  'Connecting the dots between topics...',
];

export const funFacts = [
  'Did you know? The average adult attention span is 8 seconds. Good thing we use micro-lessons!',
  'Fun fact: People remember 90% of what they do, but only 10% of what they read.',
  'Learning tip: Spaced repetition can boost retention by up to 200%.',
  'Pro tip: Teaching someone else is the fastest way to master a topic.',
  'Research shows: Interactive content increases engagement by 47%.',
];

/** Pick a random message from a pool, cycling to avoid repeats. */
export function pickMessage(pool: string[], lastIndex: number): { message: string; index: number } {
  let idx = Math.floor(Math.random() * pool.length);
  if (idx === lastIndex && pool.length > 1) {
    idx = (idx + 1) % pool.length;
  }
  return { message: pool[idx], index: idx };
}
