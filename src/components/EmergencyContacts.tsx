import React, { useState, useEffect } from 'react';

export interface EmergencyNumber {
  id: string;
  name: string;
  nameMr: string;
  number: string;
  category: 'ambulance' | 'police' | 'fire' | 'women' | 'health' | 'wari_control' | 'custom';
  icon: string;
  description: string;
  descriptionMr: string;
  badgeBg: string;
  badgeText: string;
  isCustom?: boolean;
}

const OFFICIAL_EMERGENCY_CONTACTS: EmergencyNumber[] = [
  {
    id: '108',
    name: '108 Ambulance Service',
    nameMr: '१०८ रुग्णवाहिका (अ‍ॅम्ब्युलन्स)',
    number: '108',
    category: 'ambulance',
    icon: '🚑',
    description: 'Free 24/7 Emergency Medical Response & Ambulance',
    descriptionMr: 'मोफत २४ तास वैद्यकीय आपत्कालीन सेवा व रुग्णवाहिका',
    badgeBg: 'bg-red-100',
    badgeText: 'text-red-800'
  },
  {
    id: '112',
    name: '112 / 100 Police Control',
    nameMr: '११२ / १०० पोलीस नियंत्रण कक्ष',
    number: '112',
    category: 'police',
    icon: '🚓',
    description: 'Emergency Police Assistance & Safety Control Room',
    descriptionMr: 'आणीबाणीच्या वेळी तात्काळ पोलीस मदत',
    badgeBg: 'bg-blue-100',
    badgeText: 'text-blue-800'
  },
  {
    id: '104',
    name: '104 Health Helpline',
    nameMr: '१०४ आरोग्य हेल्पलाइन',
    number: '104',
    category: 'health',
    icon: '🏥',
    description: 'Medical Consultation, Heat Stroke & First Aid',
    descriptionMr: 'वैद्यकीय सल्ला, उष्माघात आणि प्रथमोपचार मदत',
    badgeBg: 'bg-emerald-100',
    badgeText: 'text-emerald-800'
  },
  {
    id: 'wari_control',
    name: 'Pandharpur Vari Control Room',
    nameMr: 'पंढरपूर वारी नियंत्रण कक्ष',
    number: '02186223322',
    category: 'wari_control',
    icon: '🚩',
    description: 'Pandharpur Temple Admin & Route Emergency Line',
    descriptionMr: 'पंढरपूर मंदिर प्रशासन व मार्ग आपत्ती व्यवस्थापन',
    badgeBg: 'bg-saffron-100',
    badgeText: 'text-saffron-800'
  },
  {
    id: '1091',
    name: '1091 Women Safety Helpline',
    nameMr: '१०९१ महिला सुरक्षा हेल्पलाइन',
    number: '1091',
    category: 'women',
    icon: '👩',
    description: 'Dedicated Helpline for Women & Child Safety',
    descriptionMr: 'महिला व बालकांसाठी विशेष आपत्कालीन सुरक्षा रेषा',
    badgeBg: 'bg-purple-100',
    badgeText: 'text-purple-800'
  },
  {
    id: '101',
    name: '101 Fire & Rescue Services',
    nameMr: '१०१ अग्निशमन आणि बचाव सेवा',
    number: '101',
    category: 'fire',
    icon: '🚒',
    description: 'Fire Emergency & Disaster Relief Services',
    descriptionMr: 'आग, दुर्घटनेच्या वेळी बचाव व आपत्ती व्यवस्थापन',
    badgeBg: 'bg-rose-100',
    badgeText: 'text-rose-800'
  },
  {
    id: '1033',
    name: '1033 Highway Helpline',
    nameMr: '१०३३ महामार्ग हेल्पलाइन',
    number: '1033',
    category: 'police',
    icon: '🚗',
    description: 'Highway Accident Emergency & Breakdown Support',
    descriptionMr: 'महामार्ग अपघात व आपत्कालीन मदत रेषा',
    badgeBg: 'bg-amber-100',
    badgeText: 'text-amber-800'
  }
];

export function EmergencyContacts() {
  const [lang, setLang] = useState<'en' | 'mr'>('en');
  const [customContacts, setCustomContacts] = useState<{ id: string; name: string; number: string }[]>(() => {
    try {
      const saved = localStorage.getItem('vari_custom_emergency_contacts');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [newContactName, setNewContactName] = useState('');
  const [newContactPhone, setNewContactPhone] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [callingNumber, setCallingNumber] = useState<string | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem('vari_custom_emergency_contacts', JSON.stringify(customContacts));
    } catch {
      // ignore
    }
  }, [customContacts]);

  const handleCall = (number: string) => {
    setCallingNumber(number);
    // Standard tel: protocol opens the device phone app with number entered
    window.location.href = `tel:${number}`;
    setTimeout(() => setCallingNumber(null), 2500);
  };

  const handleAddCustom = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newContactName.trim() || !newContactPhone.trim()) return;
    const item = {
      id: `custom-${Date.now()}`,
      name: newContactName.trim(),
      number: newContactPhone.trim().replace(/[^\d+]/g, '')
    };
    setCustomContacts((prev) => [item, ...prev]);
    setNewContactName('');
    setNewContactPhone('');
    setShowAddForm(false);
  };

  const handleRemoveCustom = (id: string) => {
    setCustomContacts((prev) => prev.filter((c) => c.id !== id));
  };

  return (
    <section className="rounded-3xl border border-cream-200 bg-white p-5 shadow-sm">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-cream-100 pb-4">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-red-600 text-xl text-white shadow-sm">
            📞
          </span>
          <div>
            <h2 className="text-lg font-extrabold text-stone-900">
              {lang === 'mr' ? 'आपत्कालीन संपर्क क्रमांक' : 'Emergency Helplines'}
            </h2>
            <p className="text-xs text-stone-500">
              {lang === 'mr'
                ? '१-टॅप करून थेट फोन अ‍ॅपवर कॉल डायल करा'
                : '1-Tap redirects to your phone app with pre-filled number'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Language Toggle */}
          <div className="flex rounded-xl bg-saffron-50 p-1 border border-cream-200">
            <button
              onClick={() => setLang('en')}
              className={`rounded-lg px-2.5 py-1 text-xs font-bold transition-colors ${
                lang === 'en' ? 'bg-saffron-600 text-white' : 'text-stone-600'
              }`}
            >
              English
            </button>
            <button
              onClick={() => setLang('mr')}
              className={`rounded-lg px-2.5 py-1 text-xs font-bold transition-colors ${
                lang === 'mr' ? 'bg-saffron-600 text-white' : 'text-stone-600'
              }`}
            >
              मराठी
            </button>
          </div>
        </div>
      </div>

      {/* Grid of Emergency Cards */}
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {OFFICIAL_EMERGENCY_CONTACTS.map((item) => (
          <div
            key={item.id}
            className="flex flex-col justify-between rounded-2xl border border-cream-200 bg-saffron-50/40 p-4 transition-all hover:border-saffron-300 hover:shadow-xs"
          >
            <div>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">{item.icon}</span>
                  <span
                    className={`rounded-lg px-2 py-0.5 text-xs font-extrabold ${item.badgeBg} ${item.badgeText}`}
                  >
                    {item.number}
                  </span>
                </div>
                <span className="rounded-md bg-stone-900 px-2 py-0.5 text-[10px] font-bold text-white uppercase tracking-wider">
                  Verified 24/7
                </span>
              </div>

              <h3 className="mt-2.5 text-sm font-extrabold text-stone-900">
                {lang === 'mr' ? item.nameMr : item.name}
              </h3>
              <p className="mt-1 text-xs text-stone-600 leading-relaxed">
                {lang === 'mr' ? item.descriptionMr : item.description}
              </p>
            </div>

            <div className="mt-4 pt-3 border-t border-cream-100">
              <a
                href={`tel:${item.number}`}
                onClick={(e) => {
                  // Direct standard tel link
                  setCallingNumber(item.number);
                }}
                className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-extrabold text-white shadow-sm hover:bg-emerald-700 active:scale-98 transition-all"
              >
                <span className="text-sm">📞</span>
                <span>
                  {callingNumber === item.number
                    ? lang === 'mr'
                      ? 'फोन उघडत आहे...'
                      : 'Opening Phone App...'
                    : lang === 'mr'
                    ? `कॉल करा (${item.number})`
                    : `Call ${item.number}`}
                </span>
              </a>
            </div>
          </div>
        ))}
      </div>

      {/* Personal / Family Custom Emergency Contacts */}
      <div className="mt-6 border-t border-cream-200 pt-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-extrabold text-stone-900">
              {lang === 'mr' ? 'तुमचे वैयक्तिक / कौटुंबिक संपर्क' : 'Your Personal & Family Contacts'}
            </h3>
            <p className="text-xs text-stone-500">
              {lang === 'mr'
                ? 'आपले नातेवाईक किंवा ग्रुप लीडरचा नंबर त्वरित कॉलसाठी जोडा'
                : 'Save your family or group leader for instant 1-tap dial'}
            </p>
          </div>

          <button
            onClick={() => setShowAddForm((prev) => !prev)}
            className="flex items-center gap-1 rounded-xl bg-saffron-600 px-3 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-saffron-700 transition-colors"
          >
            <span>{showAddForm ? '✕' : '+'}</span>
            <span>{showAddForm ? (lang === 'mr' ? 'रद्द करा' : 'Cancel') : lang === 'mr' ? 'नंबर जोडा' : 'Add Contact'}</span>
          </button>
        </div>

        {/* Add Contact Form */}
        {showAddForm && (
          <form onSubmit={handleAddCustom} className="mt-3 rounded-2xl border border-saffron-200 bg-saffron-50 p-4 space-y-3">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">
                  {lang === 'mr' ? 'नाव (उदा. भाऊ / ग्रुप लीडर)' : 'Contact Name (e.g. Brother, Leader)'}
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Ramesh Patil"
                  value={newContactName}
                  onChange={(e) => setNewContactName(e.target.value)}
                  className="w-full min-h-[42px] rounded-xl border border-cream-200 bg-white px-3.5 py-2.5 text-xs text-stone-900 focus:border-saffron-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">
                  {lang === 'mr' ? 'फोन नंबर' : 'Phone Number'}
                </label>
                <input
                  type="tel"
                  required
                  placeholder="e.g. 9876543210"
                  value={newContactPhone}
                  onChange={(e) => setNewContactPhone(e.target.value)}
                  className="w-full min-h-[42px] rounded-xl border border-cream-200 bg-white px-3.5 py-2.5 text-xs text-stone-900 focus:border-saffron-600 focus:outline-none"
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full min-h-[42px] rounded-xl bg-saffron-600 py-2.5 text-xs font-extrabold text-white shadow-xs"
            >
              {lang === 'mr' ? 'संपर्क सेव्ह करा' : 'Save Emergency Contact'}
            </button>
          </form>
        )}

        {/* Custom Contacts List */}
        {customContacts.length > 0 && (
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {customContacts.map((c) => (
              <div
                key={c.id}
                className="flex items-center justify-between gap-2 rounded-2xl border border-cream-200 bg-white p-3 shadow-2xs"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-extrabold text-stone-900">{c.name}</p>
                  <p className="text-xs font-semibold text-stone-500">{c.number}</p>
                </div>

                <div className="flex items-center gap-1.5">
                  <a
                    href={`tel:${c.number}`}
                    className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-600 text-sm text-white shadow-xs hover:bg-emerald-700"
                    title={`Call ${c.name}`}
                  >
                    📞
                  </a>
                  <button
                    onClick={() => handleRemoveCustom(c.id)}
                    className="flex h-9 w-9 items-center justify-center rounded-xl bg-cream-100 text-xs font-bold text-stone-400 hover:bg-red-50 hover:text-red-600"
                    title="Delete contact"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
