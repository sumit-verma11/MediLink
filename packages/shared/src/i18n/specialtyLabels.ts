// English key -> Hindi label. Internal keys (DoctorProfile.specialties,
// specialty_map.json, every specialty-filtering query) stay English-only --
// this is a *display* lookup only, for the Hindi triage assistant message and
// the specialty cards on the web triage page. The 10 specialties with seeded,
// bookable doctors (CLAUDE.md §6.2) are complete and load-bearing; the rest
// are best-effort and NOT clinically reviewed -- any key missing here (or a
// specialty added later) falls back to the English name via
// localizeSpecialtyName rather than erroring or showing blank.
export const SPECIALTY_LABELS_HI: Record<string, string> = {
  // Seeded, bookable specialties -- these must resolve correctly.
  Dermatology: 'त्वचा रोग विशेषज्ञ',
  'General Physician': 'सामान्य चिकित्सक',
  Gastroenterology: 'गैस्ट्रोएंटेरोलॉजी',
  Cardiology: 'हृदय रोग विशेषज्ञ',
  Gynecology: 'स्त्री रोग विशेषज्ञ',
  Orthopedics: 'हड्डी रोग विशेषज्ञ',
  Pediatrics: 'बाल रोग विशेषज्ञ',
  ENT: 'कान-नाक-गला विशेषज्ञ',
  Psychiatry: 'मनोरोग विशेषज्ञ',
  Ophthalmology: 'नेत्र रोग विशेषज्ञ',
  // Remaining specialty_map.json keys, best-effort.
  Pulmonology: 'फेफड़ों के रोग विशेषज्ञ',
  Endocrinology: 'अंतःस्रावी रोग विशेषज्ञ',
  Urology: 'मूत्र रोग विशेषज्ञ',
  Nephrology: 'गुर्दा रोग विशेषज्ञ',
  Neurology: 'तंत्रिका रोग विशेषज्ञ',
  Rheumatology: 'गठिया रोग विशेषज्ञ',
  Oncology: 'कैंसर रोग विशेषज्ञ',
  Dentistry: 'दंत चिकित्सक',
  'Allergy and Immunology': 'एलर्जी एवं इम्यूनोलॉजी विशेषज्ञ',
  Physiotherapy: 'फिजियोथेरेपिस्ट',
  'Nutrition and Dietetics': 'आहार विशेषज्ञ',
  'Sports Medicine': 'खेल चिकित्सा विशेषज्ञ',
  Geriatrics: 'वृद्धावस्था रोग विशेषज्ञ',
  'Infectious Disease': 'संक्रामक रोग विशेषज्ञ',
  Hematology: 'रक्त रोग विशेषज्ञ',
  'Sexual Health': 'यौन स्वास्थ्य विशेषज्ञ',
  Podiatry: 'पैर रोग विशेषज्ञ',
  'Occupational Medicine': 'व्यावसायिक चिकित्सा विशेषज्ञ',
  'Pain Management': 'दर्द प्रबंधन विशेषज्ञ',
  'Pulmonary Rehabilitation': 'फेफड़ों की पुनर्वास चिकित्सा विशेषज्ञ',
  Andrology: 'पुरुष रोग विशेषज्ञ',
  'Reproductive Medicine and Fertility': 'प्रजनन एवं बांझपन विशेषज्ञ',
  'Vascular Surgery': 'संवहनी शल्य चिकित्सक',
  'General Surgery': 'सामान्य शल्य चिकित्सक',
  'Plastic and Cosmetic Surgery': 'प्लास्टिक एवं कॉस्मेटिक सर्जन',
  Homeopathy: 'होम्योपैथी चिकित्सक',
  Ayurveda: 'आयुर्वेद चिकित्सक',
  'Speech Therapy': 'वाक् चिकित्सा विशेषज्ञ',
  'Sleep Medicine': 'नींद रोग विशेषज्ञ',
};

export function localizeSpecialtyName(name: string, language: 'en' | 'hi'): string {
  if (language === 'hi') return SPECIALTY_LABELS_HI[name] ?? name;
  return name;
}
