/**
 * Validates a 10-digit Indian mobile phone number.
 * Must start with 6, 7, 8, or 9 and have exactly 10 digits.
 */
export function validatePhoneNumber(phone: string): { isValid: boolean; error?: string } {
  const cleanPhone = phone.replace(/\D/g, '');

  if (!cleanPhone) {
    return { isValid: false, error: 'Phone number is required' };
  }

  if (cleanPhone.length !== 10) {
    return { isValid: false, error: `Must be exactly 10 digits (currently ${cleanPhone.length} digits)` };
  }

  const indianPhoneRegex = /^[6-9]\d{9}$/;
  if (!indianPhoneRegex.test(cleanPhone)) {
    return { isValid: false, error: 'Must start with 6, 7, 8, or 9 (valid Indian mobile number)' };
  }

  return { isValid: true };
}

/**
 * Validates user full name.
 */
export function validateFullName(name: string): { isValid: boolean; error?: string } {
  const trimmed = name.trim();
  if (!trimmed) {
    return { isValid: false, error: 'Full name is required' };
  }
  if (trimmed.length < 2) {
    return { isValid: false, error: 'Name must be at least 2 characters long' };
  }
  return { isValid: true };
}

export interface VehicleLookupResult {
  rawInput: string;
  normalizedPlate: string;
  formattedPlate: string;
  isValidFormat: boolean;
  stateCode?: string;
  stateName?: string;
  rtoCode?: string;
  rtoName?: string;
  vehicleClassDescription: string;
  isRajasthanLocal: boolean;
  rtoZoneName: string;
}

const STATE_CODE_MAP: { [key: string]: string } = {
  RJ: 'Rajasthan',
  MP: 'Madhya Pradesh',
  DL: 'Delhi NCR',
  HR: 'Haryana',
  UP: 'Uttar Pradesh',
  GJ: 'Gujarat',
  MH: 'Maharashtra',
  PB: 'Punjab',
  UK: 'Uttarakhand',
  CH: 'Chandigarh',
};

const RAJASTHAN_RTO_MAP: { [key: string]: string } = {
  '01': 'Ajmer',
  '02': 'Alwar',
  '03': 'Banswara',
  '04': 'Barmer',
  '05': 'Bharatpur',
  '06': 'Bhilwara',
  '07': 'Bikaner',
  '08': 'Bundi',
  '09': 'Chittorgarh',
  '10': 'Churu',
  '11': 'Dholpur',
  '12': 'Dungarpur',
  '13': 'Ganganagar',
  '14': 'Jaipur South',
  '15': 'Jaisalmer',
  '16': 'Jalore',
  '17': 'Jhalawar',
  '18': 'Jhunjhunu',
  '19': 'Jodhpur',
  '20': 'Kota / Rawatbhata Division',
  '21': 'Nagaur',
  '22': 'Pali',
  '23': 'Sikar',
  '24': 'Sirohi',
  '25': 'Sawai Madhopur',
  '26': 'Tonk',
  '27': 'Udaipur',
  '28': 'Baran',
  '29': 'Dausa',
  '30': 'Rajsamand',
  '31': 'Hanumangarh',
  '32': 'Kotputli',
  '33': 'Ramganj Mandi / Rawatbhata Border',
  '34': 'Karauli',
  '35': 'Pratapgarh',
  '36': 'Beawar',
  '37': 'Didwana',
  '38': 'Abu Road',
  '45': 'Jaipur North',
};

export function normalizeVehiclePlate(input: string): string {
  if (!input) return '';
  return input.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

export function formatVehiclePlate(raw: string): string {
  const norm = normalizeVehiclePlate(raw);
  if (norm.length < 4) return norm;

  const state = norm.slice(0, 2);
  const rto = norm.slice(2, 4);
  const rest = norm.slice(4);

  if (norm.length <= 4) {
    return `${state}-${rto}`;
  }

  const match = rest.match(/^([A-Z]{0,3})(\d{1,4})$/);
  if (match) {
    const series = match[1];
    const number = match[2];
    return series ? `${state}-${rto}-${series}-${number}` : `${state}-${rto}-${number}`;
  }

  return `${state}-${rto}-${rest}`;
}

export function parseVehicleInfo(raw: string, vehicleType: string = 'bike'): VehicleLookupResult {
  const safeRaw = raw || '';
  const norm = normalizeVehiclePlate(safeRaw);
  const formatted = formatVehiclePlate(safeRaw);

  if (norm.length < 4) {
    return {
      rawInput: safeRaw,
      normalizedPlate: norm,
      formattedPlate: formatted || safeRaw.toUpperCase(),
      isValidFormat: false,
      vehicleClassDescription: getVehicleClassLabel(vehicleType),
      isRajasthanLocal: false,
      rtoZoneName: 'Enter valid Indian registration plate',
    };
  }

  const stateCode = norm.slice(0, 2);
  const rtoCode = norm.slice(2, 4);
  const stateName = STATE_CODE_MAP[stateCode] || `${stateCode} Transport Authority`;

  let rtoName = 'Regional Transport Office';
  const isRajasthan = stateCode === 'RJ';

  if (isRajasthan && RAJASTHAN_RTO_MAP[rtoCode]) {
    rtoName = RAJASTHAN_RTO_MAP[rtoCode];
  } else if (stateCode === 'MP' && rtoCode === '14') {
    rtoName = 'Mandsaur (Rajasthan Border)';
  } else if (stateCode === 'MP' && rtoCode === '44') {
    rtoName = 'Neemuch (Chittorgarh Border)';
  }

  const isLocalZone = isRajasthan && (rtoCode === '20' || rtoCode === '09' || rtoCode === '33' || rtoCode === '08');
  const standardPattern = /^[A-Z]{2}[0-9]{2}[A-Z]{0,3}[0-9]{1,4}$/;
  const isValid = standardPattern.test(norm) && norm.length >= 6;

  return {
    rawInput: raw,
    normalizedPlate: norm,
    formattedPlate: formatted,
    isValidFormat: isValid,
    stateCode,
    stateName,
    rtoCode,
    rtoName,
    vehicleClassDescription: getVehicleClassLabel(vehicleType),
    isRajasthanLocal: isLocalZone,
    rtoZoneName: isLocalZone
      ? `🏛️ ${rtoName} (Rawatbhata Local Fleet Zone)`
      : `🏛️ ${rtoName}, ${stateName}`,
  };
}

function getVehicleClassLabel(vehicleType: string): string {
  switch (vehicleType) {
    case 'bike':
      return '2-Wheeler Motorcycle (MCWG - Fleet Eligible)';
    case 'scooty':
      return '2-Wheeler Gearless Scooter (MCWOG - Fleet Eligible)';
    case 'auto':
      return '3-Wheeler Auto Rickshaw (Commercial Passenger)';
    case 'erickshaw':
      return 'Electric E-Rickshaw / Eco-Battery (Zero Emission)';
    default:
      return 'Light Motor Vehicle (Commercial / Logistics)';
  }
}

