import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';

export type Lang = 'en' | 'mr';

const STORAGE_KEY = 'wari-lang';

function getSavedLang(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'mr' || saved === 'en') return saved;
  } catch { /* ignore */ }
  return 'en';
}

type LangContextType = {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: string) => string;
};

const LangContext = createContext<LangContextType>({
  lang: 'en',
  setLang: () => {},
  t: (key) => key,
});

/* ─── translation dictionary ─── */
const translations: Record<string, Record<Lang, string>> = {
  /* ── Header ── */
  'Pandharpur Vari': { en: 'Pandharpur Vari', mr: 'पंढरपूर वारी' },
  'Wari Companion': { en: 'Wari Companion', mr: 'वारी सहायक' },
  'Live Sync': { en: 'Live Sync', mr: 'थेट समक्रमण' },
  'ID: Active | Role:': { en: 'ID: Active | Role:', mr: 'ओळख: सक्रिय | भूमिका:' },
  'Pilgrim Companion': { en: 'Pilgrim Companion', mr: 'वारकरी सहायक' },
  'Admin Panel': { en: 'Admin Panel', mr: 'प्रशासन पॅनेल' },
  'Sign out': { en: 'Sign out', mr: 'बाहेर पडा' },
  'Signed in': { en: 'Signed in', mr: 'साइन इन केले' },
  'Sign in / Register': { en: 'Sign in / Register', mr: 'साइन इन / नोंदणी' },

  /* ── Map & Crowd density ── */
  'Report crowd density': { en: 'Report crowd density', mr: 'गर्दी घनता नोंदवा' },
  'low': { en: 'low', mr: 'कमी' },
  'medium': { en: 'medium', mr: 'मध्यम' },
  'high': { en: 'high', mr: 'जास्त' },
  'no data yet': { en: 'no data yet', mr: 'अद्याप माहिती नाही' },
  'no data': { en: 'no data', mr: 'माहिती नाही' },
  'crowd': { en: 'crowd', mr: 'गर्दी' },
  'distance unknown': { en: 'distance unknown', mr: 'अंतर अज्ञात' },
  'away': { en: 'away', mr: 'दूर' },

  /* ── Peer item lending ── */
  'Peer item lending': { en: 'Peer item lending', mr: 'वस्तू उधार/देवाण-घेवाण' },
  'Water': { en: 'Water', mr: 'पाणी' },
  'Torch/Flashlight': { en: 'Torch/Flashlight', mr: 'टॉर्च/बॅटरी' },
  'Phone charger': { en: 'Phone charger', mr: 'फोन चार्जर' },
  'Medicine': { en: 'Medicine', mr: 'औषध' },
  'Blanket': { en: 'Blanket', mr: 'ब्लँकेट' },
  'Need: blanket, water...': { en: 'Need: blanket, water...', mr: 'हवे: ब्लँकेट, पाणी...' },
  'Request': { en: 'Request', mr: 'विनंती करा' },
  'Cancel': { en: 'Cancel', mr: 'रद्द करा' },
  'Accept': { en: 'Accept', mr: 'स्वीकार करा' },
  'Navigate to requester': { en: 'Navigate to requester', mr: 'विनंतीकर्त्याकडे मार्गदर्शन' },
  'Navigate to accepter': { en: 'Navigate to accepter', mr: 'स्वीकारकर्त्याकडे मार्गदर्शन' },
  'Requester location unavailable': { en: 'Requester location unavailable', mr: 'विनंतीकर्त्याचे स्थान उपलब्ध नाही' },
  'Accepter location unavailable': { en: 'Accepter location unavailable', mr: 'स्वीकारकर्त्याचे स्थान उपलब्ध नाही' },
  'Mark completed': { en: 'Mark completed', mr: 'पूर्ण झाले' },
  "Can't make it": { en: "Can't make it", mr: 'जमत नाही' },
  'Recent completed, cancelled, or expired activity': { en: 'Recent completed, cancelled, or expired activity', mr: 'अलीकडील पूर्ण, रद्द किंवा कालबाह्य क्रिया' },
  'open': { en: 'open', mr: 'खुले' },
  'accepted': { en: 'accepted', mr: 'स्वीकृत' },
  'completed': { en: 'completed', mr: 'पूर्ण' },
  'cancelled': { en: 'cancelled', mr: 'रद्द' },
  'expired': { en: 'expired', mr: 'कालबाह्य' },
  'pending': { en: 'pending', mr: 'प्रलंबित' },

  /* ── Lost & found / Family ── */
  'Lost & found': { en: 'Lost & found', mr: 'हरवलेले व सापडलेले' },
  'Name': { en: 'Name', mr: 'नाव' },
  'Phone': { en: 'Phone', mr: 'फोन' },
  'Emergency contact': { en: 'Emergency contact', mr: 'आणीबाणी संपर्क' },
  'Enter or generate a family group code': { en: 'Enter or generate a family group code', mr: 'कुटुंब गट कोड टाका किंवा तयार करा' },
  'Generate group code': { en: 'Generate group code', mr: 'गट कोड तयार करा' },
  'Register group': { en: 'Register group', mr: 'गट नोंदणी करा' },
  'Share code:': { en: 'Share code:', mr: 'कोड शेअर करा:' },
  "Enter your family's group code": { en: "Enter your family's group code", mr: 'तुमच्या कुटुंबाचा गट कोड टाका' },
  'Check-in location': { en: 'Check-in location', mr: 'चेक-इन स्थान' },
  '(nearest)': { en: '(nearest)', mr: '(सर्वात जवळ)' },
  'Check in at check-in location': { en: 'Check in at check-in location', mr: 'चेक-इन स्थानावर चेक इन करा' },
  'Family view group code': { en: 'Family view group code', mr: 'कुटुंब दृश्य गट कोड' },
  'Unnamed family member': { en: 'Unnamed family member', mr: 'अनामित कुटुंब सदस्य' },
  'Sighting': { en: 'Sighting', mr: 'दृष्टांत' },

  /* ── Volunteer panel ── */
  'Volunteer dashboard': { en: 'Volunteer dashboard', mr: 'स्वयंसेवक डॅशबोर्ड' },
  'Auth-gated in production; demo shows live active alerts, sightings, and requests.': {
    en: 'Auth-gated in production; demo shows live active alerts, sightings, and requests.',
    mr: 'प्रत्यक्ष वापरात प्रमाणीकरण आवश्यक; डेमो थेट सक्रिय सूचना, दृष्टांत आणि विनंत्या दाखवतो.'
  },
  'Apply for Volunteer in Vari': { en: 'Apply for Volunteer in Vari', mr: 'वारीत स्वयंसेवक म्हणून अर्ज करा' },
  'Sign in to access volunteer features.': { en: 'Sign in to access volunteer features.', mr: 'स्वयंसेवक वैशिष्ट्यांसाठी साइन इन करा.' },
  'Loading access...': { en: 'Loading access...', mr: 'प्रवेश लोड करत आहे...' },
  'Approved volunteer or admin access is required.': { en: 'Approved volunteer or admin access is required.', mr: 'मंजूर स्वयंसेवक किंवा प्रशासक प्रवेश आवश्यक आहे.' },
  'Node filter': { en: 'Node filter', mr: 'ठिकाण फिल्टर' },
  'All nodes': { en: 'All nodes', mr: 'सर्व ठिकाणे' },
  'SOS alerts': { en: 'SOS alerts', mr: 'SOS सूचना' },
  'SOS near': { en: 'SOS near', mr: 'SOS जवळपास' },
  'Resolve': { en: 'Resolve', mr: 'निराकरण' },
  'Sightings': { en: 'Sightings', mr: 'दृष्टांत' },
  'verified': { en: 'verified', mr: 'सत्यापित' },
  'Verify': { en: 'Verify', mr: 'सत्यापित करा' },
  'SOS': { en: 'SOS', mr: 'SOS' },
  'active': { en: 'active', mr: 'सक्रिय' },
  'resolved': { en: 'resolved', mr: 'निराकरण केले' },

  /* ── Volunteer Application Modal ── */
  'Volunteer Application for Wari': { en: 'Volunteer Application for Wari', mr: 'वारीसाठी स्वयंसेवक अर्ज' },

  /* ── Notices ── */
  'Please sign in to use this feature.': { en: 'Please sign in to use this feature.', mr: 'हे वैशिष्ट्य वापरण्यासाठी कृपया साइन इन करा.' },
  'Choose a route node before reporting crowd density.': { en: 'Choose a route node before reporting crowd density.', mr: 'गर्दी नोंदवण्यापूर्वी मार्गावरील ठिकाण निवडा.' },
  'Crowd density report saved.': { en: 'Crowd density report saved.', mr: 'गर्दी घनता अहवाल जतन केला.' },
  'Please sign in and enter a name before registering a group.': { en: 'Please sign in and enter a name before registering a group.', mr: 'गट नोंदणी करण्यापूर्वी कृपया साइन इन करा आणि नाव टाका.' },
  'Enter or generate a family group code.': { en: 'Enter or generate a family group code.', mr: 'कुटुंब गट कोड टाका किंवा तयार करा.' },
  'Photo upload failed:': { en: 'Photo upload failed:', mr: 'फोटो अपलोड अयशस्वी:' },
  'Joined existing group.': { en: 'Joined existing group.', mr: 'विद्यमान गटात सामील झालात.' },
  'Created new group.': { en: 'Created new group.', mr: 'नवीन गट तयार केला.' },
  'Choose a check-in node and enter your family group code.': { en: 'Choose a check-in node and enter your family group code.', mr: 'चेक-इन ठिकाण निवडा आणि तुमचा कुटुंब गट कोड टाका.' },
  'Check-in saved.': { en: 'Check-in saved.', mr: 'चेक-इन जतन केले.' },
  'Check-in failed.': { en: 'Check-in failed.', mr: 'चेक-इन अयशस्वी.' },
  'SOS sent.': { en: 'SOS sent.', mr: 'SOS पाठवले.' },
  'SOS failed.': { en: 'SOS failed.', mr: 'SOS अयशस्वी.' },
  'Signed out successfully.': { en: 'Signed out successfully.', mr: 'यशस्वीरित्या बाहेर पडलात.' },
  'Sign out failed.': { en: 'Sign out failed.', mr: 'बाहेर पडणे अयशस्वी.' },

  /* ── Active request warning ── */
  'You already have an active request for': { en: 'You already have an active request for', mr: 'तुमची आधीच एक सक्रिय विनंती आहे:' },
  '. Complete or cancel it before creating another.': { en: '. Complete or cancel it before creating another.', mr: '. दुसरी तयार करण्यापूर्वी ती पूर्ण किंवा रद्द करा.' },

  /* ── AuthModal ── */
  'Welcome': { en: 'Welcome', mr: 'स्वागत आहे' },
  'Sign In': { en: 'Sign In', mr: 'साइन इन' },
  'Register': { en: 'Register', mr: 'नोंदणी' },
  'Reset': { en: 'Reset', mr: 'रीसेट' },
  'Email': { en: 'Email', mr: 'ईमेल' },
  'Password': { en: 'Password', mr: 'पासवर्ड' },
  'Signing In...': { en: 'Signing In...', mr: 'साइन इन होत आहे...' },
  'Please fill in all fields.': { en: 'Please fill in all fields.', mr: 'कृपया सर्व माहिती भरा.' },
  'Signed in successfully!': { en: 'Signed in successfully!', mr: 'यशस्वीरित्या साइन इन झाले!' },
  'Sign in failed.': { en: 'Sign in failed.', mr: 'साइन इन अयशस्वी.' },
  'Account Email': { en: 'Account Email', mr: 'खाते ईमेल' },
  'Sending Reset...': { en: 'Sending Reset...', mr: 'रीसेट पाठवत आहे...' },
  'Send Password Reset': { en: 'Send Password Reset', mr: 'पासवर्ड रीसेट पाठवा' },
  'Please enter your email address.': { en: 'Please enter your email address.', mr: 'कृपया तुमचा ईमेल पत्ता टाका.' },
  'Password reset email sent. Check your inbox for the secure reset link.': {
    en: 'Password reset email sent. Check your inbox for the secure reset link.',
    mr: 'पासवर्ड रीसेट ईमेल पाठवला. सुरक्षित रीसेट लिंकसाठी तुमचा इनबॉक्स तपासा.'
  },
  'Password reset failed.': { en: 'Password reset failed.', mr: 'पासवर्ड रीसेट अयशस्वी.' },
  'Display Name': { en: 'Display Name', mr: 'प्रदर्शन नाव' },
  'Your name': { en: 'Your name', mr: 'तुमचे नाव' },
  'Minimum 6 characters': { en: 'Minimum 6 characters', mr: 'किमान ६ अक्षरे' },
  'Confirm Password': { en: 'Confirm Password', mr: 'पासवर्ड पुष्टी करा' },
  'Confirm your password': { en: 'Confirm your password', mr: 'तुमचा पासवर्ड पुष्टी करा' },
  'Creating Account...': { en: 'Creating Account...', mr: 'खाते तयार होत आहे...' },
  'Create Account': { en: 'Create Account', mr: 'खाते तयार करा' },
  'Please enter your display name.': { en: 'Please enter your display name.', mr: 'कृपया तुमचे प्रदर्शन नाव टाका.' },
  'Password must be at least 6 characters.': { en: 'Password must be at least 6 characters.', mr: 'पासवर्ड किमान ६ अक्षरांचा असावा.' },
  'Passwords do not match.': { en: 'Passwords do not match.', mr: 'पासवर्ड जुळत नाहीत.' },
  'Account created successfully. Please check your email if email confirmation is enabled.': {
    en: 'Account created successfully. Please check your email if email confirmation is enabled.',
    mr: 'खाते यशस्वीरित्या तयार झाले. ईमेल पुष्टीकरण सक्षम असल्यास कृपया तुमचा ईमेल तपासा.'
  },
  'Registration failed.': { en: 'Registration failed.', mr: 'नोंदणी अयशस्वी.' },

  /* ── Volunteer Application Form ── */
  'Full Name': { en: 'Full Name', mr: 'पूर्ण नाव' },
  'e.g. Rahul Sharma': { en: 'e.g. Rahul Sharma', mr: 'उदा. राहुल शर्मा' },
  'Phone Number': { en: 'Phone Number', mr: 'फोन नंबर' },
  'Preferred Station': { en: 'Preferred Station', mr: 'पसंतीचे ठिकाण' },
  'Select a station': { en: 'Select a station', mr: 'ठिकाण निवडा' },
  'Route stations unavailable': { en: 'Route stations unavailable', mr: 'मार्ग ठिकाणे उपलब्ध नाहीत' },
  'Age': { en: 'Age', mr: 'वय' },
  'City': { en: 'City', mr: 'शहर' },
  'Pune / Solapur': { en: 'Pune / Solapur', mr: 'पुणे / सोलापूर' },
  'Experience & Motivation': { en: 'Experience & Motivation', mr: 'अनुभव आणि प्रेरणा' },
  'Prior Seva or crowd management experience...': { en: 'Prior Seva or crowd management experience...', mr: 'पूर्वीचा सेवा किंवा गर्दी व्यवस्थापन अनुभव...' },
  'Submitting Application...': { en: 'Submitting Application...', mr: 'अर्ज सादर होत आहे...' },
  'Apply to Volunteer': { en: 'Apply to Volunteer', mr: 'स्वयंसेवक म्हणून अर्ज करा' },
  'Please enter your full name.': { en: 'Please enter your full name.', mr: 'कृपया तुमचे पूर्ण नाव टाका.' },
  'Please enter your phone number.': { en: 'Please enter your phone number.', mr: 'कृपया तुमचा फोन नंबर टाका.' },
  'Please enter an emergency contact number.': { en: 'Please enter an emergency contact number.', mr: 'कृपया आणीबाणी संपर्क नंबर टाका.' },
  'Please select a preferred station.': { en: 'Please select a preferred station.', mr: 'कृपया पसंतीचे ठिकाण निवडा.' },
  'Please enter a valid age (minimum 13 years).': { en: 'Please enter a valid age (minimum 13 years).', mr: 'कृपया वैध वय टाका (किमान १३ वर्षे).' },
  'Please enter your city.': { en: 'Please enter your city.', mr: 'कृपया तुमचे शहर टाका.' },
  'Your volunteer application has been submitted for admin review.': {
    en: 'Your volunteer application has been submitted for admin review.',
    mr: 'तुमचा स्वयंसेवक अर्ज प्रशासक पुनरावलोकनासाठी सादर केला आहे.'
  },
  '✓ Your volunteer application has been approved. Thank you for serving Wari pilgrims!': {
    en: '✓ Your volunteer application has been approved. Thank you for serving Wari pilgrims!',
    mr: '✓ तुमचा स्वयंसेवक अर्ज मंजूर झाला आहे. वारकऱ्यांची सेवा केल्याबद्दल धन्यवाद!'
  },
  'Your previous application was rejected. You may submit a new application with updated details.': {
    en: 'Your previous application was rejected. You may submit a new application with updated details.',
    mr: 'तुमचा मागील अर्ज नाकारला गेला. तुम्ही अद्ययावत तपशीलांसह नवीन अर्ज सादर करू शकता.'
  },
  'An unexpected error occurred.': { en: 'An unexpected error occurred.', mr: 'अनपेक्षित त्रुटी आली.' },
  'Sign In to Submit Application': { en: 'Sign In to Submit Application', mr: 'अर्ज सादर करण्यासाठी साइन इन करा' },

  /* ── Admin Panel ── */
  'CONTROL CENTER': { en: 'CONTROL CENTER', mr: 'नियंत्रण केंद्र' },
  'Admin Control Panel': { en: 'Admin Control Panel', mr: 'प्रशासन नियंत्रण पॅनेल' },
  'Manage volunteer approvals, route nodes, user permissions, and system metrics.': {
    en: 'Manage volunteer approvals, route nodes, user permissions, and system metrics.',
    mr: 'स्वयंसेवक मंजुरी, मार्ग ठिकाणे, वापरकर्ता परवानग्या आणि प्रणाली मेट्रिक्स व्यवस्थापित करा.'
  },
  'Admin Dashboard Login': { en: 'Admin Dashboard Login', mr: 'प्रशासक डॅशबोर्ड लॉगिन' },
  'Log in with an administrator account to verify volunteer applications, grant roles, and monitor metrics.': {
    en: 'Log in with an administrator account to verify volunteer applications, grant roles, and monitor metrics.',
    mr: 'स्वयंसेवक अर्ज सत्यापित करण्यासाठी, भूमिका देण्यासाठी आणि मेट्रिक्स पाहण्यासाठी प्रशासक खात्याने लॉग इन करा.'
  },
  'ADMIN EMAIL': { en: 'ADMIN EMAIL', mr: 'प्रशासक ईमेल' },
  'ADMIN PASSWORD': { en: 'ADMIN PASSWORD', mr: 'प्रशासक पासवर्ड' },
  'Authenticating...': { en: 'Authenticating...', mr: 'प्रमाणीकरण होत आहे...' },
  'Log In as Admin': { en: 'Log In as Admin', mr: 'प्रशासक म्हणून लॉग इन करा' },
  'Please enter admin email and password.': { en: 'Please enter admin email and password.', mr: 'कृपया प्रशासक ईमेल आणि पासवर्ड टाका.' },
  'Admin login failed.': { en: 'Admin login failed.', mr: 'प्रशासक लॉगिन अयशस्वी.' },
  'Supabase backend URL / Key is missing or unconfigured in .env.': {
    en: 'Supabase backend URL / Key is missing or unconfigured in .env.',
    mr: 'Supabase बॅकएंड URL / Key .env मध्ये गहाळ किंवा कॉन्फिगर न केलेले आहे.'
  },
  'PENDING VOLUNTEERS': { en: 'PENDING VOLUNTEERS', mr: 'प्रलंबित स्वयंसेवक' },
  'ACTIVE SOS EMERGENCIES': { en: 'ACTIVE SOS EMERGENCIES', mr: 'सक्रिय SOS आणीबाणी' },
  'REGISTERED PROFILES': { en: 'REGISTERED PROFILES', mr: 'नोंदणीकृत प्रोफाइल' },
  'ROUTE STATIONS': { en: 'ROUTE STATIONS', mr: 'मार्ग ठिकाणे' },
  'Pending Volunteer Applications': { en: 'Pending Volunteer Applications', mr: 'प्रलंबित स्वयंसेवक अर्ज' },
  'No pending volunteer applications.': { en: 'No pending volunteer applications.', mr: 'प्रलंबित स्वयंसेवक अर्ज नाहीत.' },
  'Phone:': { en: 'Phone:', mr: 'फोन:' },
  'Emergency Contact:': { en: 'Emergency Contact:', mr: 'आणीबाणी संपर्क:' },
  'Preferred Station:': { en: 'Preferred Station:', mr: 'पसंतीचे ठिकाण:' },
  'Not provided': { en: 'Not provided', mr: 'दिलेले नाही' },
  'Experience:': { en: 'Experience:', mr: 'अनुभव:' },
  'Approve as Volunteer': { en: 'Approve as Volunteer', mr: 'स्वयंसेवक म्हणून मंजूर करा' },
  'Reject': { en: 'Reject', mr: 'नाकारा' },
  'Route Node Management': { en: 'Route Node Management', mr: 'मार्ग ठिकाण व्यवस्थापन' },
  'Node name': { en: 'Node name', mr: 'ठिकाणाचे नाव' },
  'Latitude': { en: 'Latitude', mr: 'अक्षांश' },
  'Longitude': { en: 'Longitude', mr: 'रेखांश' },
  'Sequence': { en: 'Sequence', mr: 'क्रम' },
  'Update node': { en: 'Update node', mr: 'ठिकाण अपडेट करा' },
  'Add node': { en: 'Add node', mr: 'ठिकाण जोडा' },
  'Edit': { en: 'Edit', mr: 'संपादन' },
  'Remove': { en: 'Remove', mr: 'काढा' },
  'Approved': { en: 'Approved', mr: 'मंजूर' },
  'Route node updated.': { en: 'Route node updated.', mr: 'मार्ग ठिकाण अपडेट केले.' },
  'Route node added.': { en: 'Route node added.', mr: 'मार्ग ठिकाण जोडले.' },
  'Route node removed.': { en: 'Route node removed.', mr: 'मार्ग ठिकाण काढले.' },
  'Enter a valid node name, latitude, longitude, and sequence order.': {
    en: 'Enter a valid node name, latitude, longitude, and sequence order.',
    mr: 'वैध ठिकाणाचे नाव, अक्षांश, रेखांश आणि क्रम टाका.'
  },
  'Volunteer approval failed:': { en: 'Volunteer approval failed:', mr: 'स्वयंसेवक मंजुरी अयशस्वी:' },
  'Volunteer approval profile update failed:': { en: 'Volunteer approval profile update failed:', mr: 'स्वयंसेवक मंजुरी प्रोफाइल अपडेट अयशस्वी:' },
  'Approved as volunteer.': { en: 'Approved as volunteer.', mr: 'स्वयंसेवक म्हणून मंजूर केले.' },
  'Rejected application for': { en: 'Rejected application for', mr: 'अर्ज नाकारला:' },
  'Volunteer rejection failed:': { en: 'Volunteer rejection failed:', mr: 'स्वयंसेवक नकार अयशस्वी:' },

  /* ── Language Toggle ── */
  'English': { en: 'English', mr: 'इंग्रजी' },
  'मराठी': { en: 'मराठी', mr: 'मराठी' },

  /* ── Self check-in ── */
  'Self check-in for': { en: 'Self check-in for', mr: 'स्व-चेक-इन:' },
};

/* ─── Provider ─── */
export function LangProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(getSavedLang);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    try { localStorage.setItem(STORAGE_KEY, next); } catch { /* ignore */ }
  }, []);

  // Also sync if another tab changes it
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && (e.newValue === 'en' || e.newValue === 'mr')) {
        setLangState(e.newValue);
      }
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, []);

  const t = useCallback((key: string): string => {
    return translations[key]?.[lang] ?? key;
  }, [lang]);

  return (
    <LangContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LangContext.Provider>
  );
}

export function useLang() {
  return useContext(LangContext);
}

/* ─── Toggle Button Component ─── */
export function LangToggle() {
  const { lang, setLang } = useLang();
  return (
    <button
      type="button"
      onClick={() => setLang(lang === 'en' ? 'mr' : 'en')}
      className="rounded-xl px-3 py-2 text-xs font-bold transition-all bg-orange-800/40 text-white hover:bg-orange-800/60 border border-white/10 flex items-center gap-1.5"
      aria-label="Toggle language"
    >
      <span>🌐</span>
      {lang === 'en' ? 'मराठी' : 'English'}
    </button>
  );
}
