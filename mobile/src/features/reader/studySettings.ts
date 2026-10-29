// The reader's view of the device choices Settings owns: the faith tradition (mobile/src/storage/faithTradition.ts),
// which decides whether Latter-day Saint material is shown (the JST, chapter study paths, lesson resources), and the
// Bible library (mobile/src/storage/bibleLibrary.ts), including whether Bible chapters read Joseph Smith Translation
// passages in place. Both keep the web's keys and values. The reader's files import them only from here.

export { useFaithTradition } from "../../storage/faithTradition";
export { useJstPreference } from "../../storage/bibleLibrary";
