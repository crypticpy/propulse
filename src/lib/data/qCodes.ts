/**
 * Amateur-radio-relevant Q-codes (ITU/ARRL standard meanings).
 *
 * Each code has a question form ("Are you...?" / "Shall I...?") and a
 * statement/answer form ("I am..." / "I will..."), per international
 * convention.
 */

export interface QCode {
  code: string;
  question: string;
  statement: string;
}

export const Q_CODES: QCode[] = [
  { code: "QRA", question: "What is the name of your station?", statement: "The name of my station is ___." },
  { code: "QRB", question: "How far approximately are you from my station?", statement: "The approximate distance between our stations is ___." },
  { code: "QRG", question: "Will you tell me my exact frequency?", statement: "Your exact frequency is ___." },
  { code: "QRH", question: "Does my frequency vary?", statement: "Your frequency varies." },
  { code: "QRI", question: "How is the tone of my transmission?", statement: "The tone of your transmission is ___ (1. Good; 2. Variable; 3. Bad)." },
  { code: "QRK", question: "What is the intelligibility of my signals?", statement: "The intelligibility of your signals is ___ (1-5)." },
  { code: "QRL", question: "Are you busy?", statement: "I am busy (or busy with ___). Please do not interfere." },
  { code: "QRM", question: "Are you being interfered with?", statement: "I am being interfered with." },
  { code: "QRN", question: "Are you troubled by static?", statement: "I am troubled by static." },
  { code: "QRO", question: "Shall I increase power?", statement: "Increase power." },
  { code: "QRP", question: "Shall I decrease power?", statement: "Decrease power." },
  { code: "QRQ", question: "Shall I send faster?", statement: "Send faster (___ WPM)." },
  { code: "QRS", question: "Shall I send more slowly?", statement: "Send more slowly (___ WPM)." },
  { code: "QRT", question: "Shall I stop sending?", statement: "Stop sending." },
  { code: "QRU", question: "Have you anything for me?", statement: "I have nothing for you." },
  { code: "QRV", question: "Are you ready?", statement: "I am ready." },
  { code: "QRX", question: "When will you call me again?", statement: "I will call you again at ___ (hours) on ___ (frequency)." },
  { code: "QRZ", question: "Who is calling me?", statement: "You are being called by ___ (on ___ frequency)." },
  { code: "QSA", question: "What is the strength of my signals?", statement: "The strength of your signals is ___ (1-5)." },
  { code: "QSB", question: "Are my signals fading?", statement: "Your signals are fading." },
  { code: "QSK", question: "Can you hear me between your signals and if so can I break in on your transmission?", statement: "I can hear you between my signals; break in on my transmission." },
  { code: "QSL", question: "Can you acknowledge receipt?", statement: "I acknowledge receipt." },
  { code: "QSO", question: "Can you communicate with ___ direct or by relay?", statement: "I can communicate with ___ direct (or by relay)." },
  { code: "QSP", question: "Will you relay to ___?", statement: "I will relay to ___." },
  { code: "QST", question: "Is there a general call for all amateurs?", statement: "Here is a broadcast/general call for all amateurs." },
  { code: "QSX", question: "Will you listen for ___ on ___ frequency?", statement: "I am listening for ___ on ___ frequency." },
  { code: "QSY", question: "Shall I change to another frequency?", statement: "Change to another frequency (or to ___ frequency)." },
  { code: "QTC", question: "How many messages have you to send?", statement: "I have ___ messages for you (or for ___)." },
  { code: "QTH", question: "What is your location?", statement: "My location is ___." },
  { code: "QTR", question: "What is the correct time?", statement: "The correct time is ___." },
];
