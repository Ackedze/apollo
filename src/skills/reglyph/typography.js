'use strict';
// ReGlyph typography: keep short Russian function words with the following word.
const keepWords = value => {
  let text=String(value),previous;
  const hanging=/(^|[\s(«„“])(в|во|вне|до|за|из|изо|к|ко|между|на|над|надо|о|об|обо|от|ото|перед|передо|по|под|подо|при|про|с|со|у|через|без|безо|для|ради|сквозь|среди|против|около|после|вокруг|вдоль|внутри|вместо|кроме|возле|и|а|но|или|не|ни|я)[ \t]+(?=\S)/gimu;
  do{previous=text;text=text.replace(hanging,'$1$2\u00a0');}while(text!==previous);
  return text;
};
module.exports = {keepWords};
