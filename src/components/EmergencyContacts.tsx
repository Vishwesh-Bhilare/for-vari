import React, { useState, useEffect } from 'react';

export interface EmergencyNumber {
  id: string;
  name: string;
  nameMr: string;
  number: string;
  category: string;
  icon: string;
  description: string;
  descriptionMr: string;
  badgeBg: string;
  badgeText: string;
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
    name: '112 / 100 Police Control Room',
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
    name: '104 Medical & Health Helpline',
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
    name: '1033 Highway Emergency',
    nameMr: '१०३३ महामार्ग हेल्पलाइन',
    number: '1033',
    category: 'traffic',
    icon: '🚗',
    description: 'Highway Accident Emergency & Breakdown Support',
    descriptionMr: 'महामार्ग अपघात व आपत्कालीन मदत रेषा',
    badgeBg: 'bg-amber-100',
    badgeText: 'text-amber-800'
  }
];

export function EmergencyContacts() {
  const [isOpen, setIsOpen] = useState(true);
  const [lang, setLang] = useState<'en' | 'mr'>('en');
  const [selectedId, setSelectedId] = useState<string>('108');
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

  useEffect(() => {
    try {
      localStorage.setItem('vari_custom_emergency_contacts', JSON.stringify(customContacts));
    } catch {
      // ignore
    }
  }, [customContacts]);

  const selectedContact = OFFICIAL_EMERGENCY_CONTACTS.find((c) => c.id === selectedId) || OFFICIAL_EMERGENCY_CONTACTS[0];

  const triggerCall = (num: string) => {
    const cleanNumber = num.replace(/[^\d+]/g, '');
    const telUri = `tel:${cleanNumber}`;
    window.location.href = telUri;
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

  return (
    <section className="rounded-3xl border border-red-200 bg-white shadow-sm overflow-hidden transition-all">
      {/* Dropdown Collapsible Header */}
      <div 
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex items-center justify-between gap-3 bg-red-600 px-5 py-4 text-white cursor-pointer select-none hover:bg-red-700 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/20 text-xl">
            📞
          </span>
          <div>
            <h2 className="text-base font-extrabold leading-tight">
              {lang === 'mr' ? 'आपत्कालीन हेल्पलाइन ड्रॉपडाऊन (108 / 112 / 104)' : 'Emergency Helplines Dropdown (108 / 112 / 104)'}
            </h2>
            <p className="text-xs text-red-100 font-medium">
              {lang === 'mr' ? 'थेट फोन डायलर उघडण्यासाठी १-क्लिक कॉल करा' : '1-Click Call to open Phone Dialer directly'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Language Toggle */}
          <div className="flex rounded-lg bg-red-800/80 p-0.5" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setLang('en')}
              className={`rounded-md px-2 py-0.5 text-xs font-bold transition-colors ${
                lang === 'en' ? 'bg-white text-red-700' : 'text-red-100'
              }`}
            >
              EN
            </button>
            <button
              onClick={() => setLang('mr')}
              className={`rounded-md px-2 py-0.5 text-xs font-bold transition-colors ${
                lang === 'mr' ? 'bg-white text-red-700' : 'text-red-100'
              }`}
            >
              मराठी
            </button>
          </div>

          <span className={`text-xl transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}>
            ▼
          </span>
        </div>
      </div>

      {/* Dropdown Body */}
      {isOpen && (
        <div className="p-5 space-y-5 bg-saffron-50/20">
          {/* Contact Select Dropdown Box */}
          <div className="rounded-2xl border border-red-200 bg-white p-4 shadow-xs">
            <label className="block text-xs font-extrabold text-stone-900 mb-2 uppercase tracking-wide">
              {lang === 'mr' ? 'आपत्कालीन सेवा निवडा (Select Emergency Service):' : 'Select Emergency Service:'}
            </label>
            <select
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              className="w-full min-h-[48px] rounded-xl border border-cream-300 bg-saffron-50 px-3.5 py-3 text-sm font-extrabold text-stone-900 focus:border-red-600 focus:ring-2 focus:ring-red-600/20 focus:outline-none"
            >
              {OFFICIAL_EMERGENCY_CONTACTS.map((contact) => (
                <option key={contact.id} value={contact.id}>
                  {contact.icon} {contact.number} — {lang === 'mr' ? contact.nameMr : contact.name}
                </option>
              ))}
            </select>

            {/* Selected Contact Card Details & Big Call Button */}
            {selectedContact && (
              <div className="mt-4 rounded-2xl border border-cream-200 bg-saffron-50/60 p-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-3xl">{selectedContact.icon}</span>
                    <div>
                      <h3 className="text-base font-extrabold text-stone-900">
                        {lang === 'mr' ? selectedContact.nameMr : selectedContact.name}
                      </h3>
                      <p className="text-xs text-stone-600">
                        {lang === 'mr' ? selectedContact.descriptionMr : selectedContact.description}
                      </p>
                    </div>
                  </div>
                  <span className={`rounded-xl px-3 py-1 text-sm font-extrabold ${selectedContact.badgeBg} ${selectedContact.badgeText}`}>
                    {selectedContact.number}
                  </span>
                </div>

                {/* Big Green 1-Tap Call Redirection Button */}
                <div className="mt-4">
                  <a
                    href={`tel:${selectedContact.number}`}
                    onClick={(e) => {
                      triggerCall(selectedContact.number);
                    }}
                    className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-extrabold text-white shadow-md hover:bg-emerald-700 active:scale-98 transition-all"
                  >
                    <span className="text-lg">📞</span>
                    <span>
                      {lang === 'mr'
                        ? `${selectedContact.number} वर कॉल करा (Call ${selectedContact.number})`
                        : `Call ${selectedContact.number} Now`}
                    </span>
                  </a>
                </div>
              </div>
            )}
          </div>

          {/* Quick 1-Tap Helpline Buttons */}
          <div>
            <h3 className="text-xs font-extrabold uppercase tracking-wide text-stone-500 mb-2">
              {lang === 'mr' ? 'सर्व आपत्कालीन क्रमांक (Quick 1-Tap Dial):' : 'All Helplines (Quick 1-Tap Dial):'}
            </h3>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {OFFICIAL_EMERGENCY_CONTACTS.map((item) => (
                <div
                  key={item.id}
                  className={`flex items-center justify-between gap-2 rounded-2xl border p-3 bg-white ${
                    selectedId === item.id ? 'border-red-500 ring-2 ring-red-500/20' : 'border-cream-200'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xl">{item.icon}</span>
                    <div className="min-w-0">
                      <p className="truncate text-xs font-extrabold text-stone-900">
                        {lang === 'mr' ? item.nameMr : item.name}
                      </p>
                      <span className={`inline-block rounded-md px-1.5 py-0.5 text-[10px] font-bold ${item.badgeBg} ${item.badgeText}`}>
                        {item.number}
                      </span>
                    </div>
                  </div>

                  <a
                    href={`tel:${item.number}`}
                    onClick={(e) => {
                      triggerCall(item.number);
                    }}
                    className="flex h-10 px-3 items-center justify-center gap-1 rounded-xl bg-emerald-600 text-xs font-extrabold text-white shadow-xs hover:bg-emerald-700 active:scale-95 transition-all shrink-0"
                  >
                    <span>📞</span>
                    <span>Call</span>
                  </a>
                </div>
              ))}
            </div>
          </div>

          {/* Personal Emergency Contacts */}
          <div className="border-t border-cream-200 pt-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-extrabold uppercase tracking-wide text-stone-500">
                {lang === 'mr' ? 'वैयक्तिक आपत्कालीन संपर्क (Personal Contacts):' : 'Personal & Family Contacts:'}
              </h3>
              <button
                onClick={() => setShowAddForm((prev) => !prev)}
                className="flex items-center gap-1 rounded-xl bg-stone-900 px-3 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-stone-800"
              >
                <span>{showAddForm ? '✕' : '+'}</span>
                <span>{showAddForm ? (lang === 'mr' ? 'रद्द करा' : 'Cancel') : lang === 'mr' ? 'जोडा' : 'Add Number'}</span>
              </button>
            </div>

            {showAddForm && (
              <form onSubmit={handleAddCustom} className="mt-3 rounded-2xl border border-cream-200 bg-white p-4 space-y-3">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <input
                    type="text"
                    required
                    placeholder="Contact Name (e.g. Ramesh)"
                    value={newContactName}
                    onChange={(e) => setNewContactName(e.target.value)}
                    className="w-full min-h-[42px] rounded-xl border border-cream-200 bg-saffron-50 px-3.5 py-2.5 text-xs text-stone-900 focus:outline-none"
                  />
                  <input
                    type="tel"
                    required
                    placeholder="Phone Number (e.g. 9876543210)"
                    value={newContactPhone}
                    onChange={(e) => setNewContactPhone(e.target.value)}
                    className="w-full min-h-[42px] rounded-xl border border-cream-200 bg-saffron-50 px-3.5 py-2.5 text-xs text-stone-900 focus:outline-none"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full min-h-[42px] rounded-xl bg-saffron-600 py-2.5 text-xs font-extrabold text-white shadow-xs"
                >
                  Save Personal Emergency Contact
                </button>
              </form>
            )}

            {customContacts.length > 0 && (
              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {customContacts.map((c) => (
                  <div key={c.id} className="flex items-center justify-between gap-2 rounded-2xl border border-cream-200 bg-white p-3">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-extrabold text-stone-900">{c.name}</p>
                      <p className="text-xs font-semibold text-stone-500">{c.number}</p>
                    </div>

                    <a
                      href={`tel:${c.number}`}
                      onClick={(e) => {
                        triggerCall(c.number);
                      }}
                      className="flex h-9 px-3 items-center justify-center gap-1 rounded-xl bg-emerald-600 text-xs font-bold text-white shadow-xs hover:bg-emerald-700"
                    >
                      <span>📞</span>
                      <span>Call</span>
                    </a>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
