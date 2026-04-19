window.HCC = window.HCC || {};
HCC.tasks = HCC.tasks || {};

HCC.tasks.CATEGORY_DEFINITIONS = [
  {
    key: 'work_skye',
    label: 'Skye Work',
    keywords: [
      'skye work', 'photo paper', 'photo printer', 'portfolio', 'memory card', 'memory cards', 'adobe', 'adobe cloud',
      'framing', 'mat board', 'mat boards', 'photography', 'photos', 'photo', 'photo shoot', 'client gallery',
      'editing session', 'edit photos', 'edit photo', 'printer', 'archived photos', 'archived photo', 'luster',
      'semigloss', 'frame', 'frames'
    ],
  },
  {
    key: 'child',
    label: 'Child',
    keywords: [
      'tor', 'torben', 'boo', 'kindy', 'kindergarten', 'school run', 'toy library', 'playgroup', 'play group', 'daycare',
      'day care', 'childcare', 'child care', 'preschool', 'pre-school', 'dropoff', 'drop off', 'pickup', 'pick up',
      'lunchbox', 'backpack', 'uniform', 'teacher', 'classroom', 'class', 'playroom', 'toy', 'toys', 'kid', 'kids',
      'child', 'children', 'birthday', 'drawing', 'drawings', 'grandparents', 'swimming lessons',
      'swim lesson', 'travel cot'
    ],
  },
  {
    key: 'travel',
    label: 'Travel',
    keywords: [
      'flight', 'flights', 'hotel', 'airbnb', 'airport', 'transfer', 'transfers', 'transport', 'trip', 'travel', 'sydney',
      'olympic park', 'reservation', 'itinerary', 'boarding', 'book hotel', 'book flight', 'book airbnb'
    ],
  },
  {
    key: 'fitness',
    label: 'Fitness',
    keywords: [
      'hyrox', 'crossfit', 'recovery session', 'workout', 'gym', 'training', 'train', 'race day', 'race', 'run',
      'rowing', 'lift', 'lifting', 'exercise', 'session', 'aquatic centre', 'swim', 'swimming', 'pool session'
    ],
  },
  {
    key: 'garden',
    label: 'Garden',
    keywords: [
      'garden', 'plants', 'plant', 'dripper', 'drippers', 'hose', 'front yard', 'weed killer', 'weed', 'sprayer', 'yard',
      'soil', 'pot', 'pots', 'watering', 'dig plants', 'lawn', 'mow', 'mowing', 'sprinkler', 'mulch', 'prune', 'pruning'
    ],
  },
  {
    key: 'creative',
    label: 'Creative',
    keywords: [
      'opera', 'concert', 'woodwork', 'woodworking', 'reading', 'read', 'book to read', 'cricut', 'design', 'designing',
      'jazz', 'tshirt', 'tshirts', 't-shirt', 't-shirts', 'shirt', 'shirts', 'great opera hits', 'opera house', 'music',
      'art', 'paint', 'painting', 'write', 'writing'
    ],
  },
  {
    key: 'project',
    label: 'Project',
    keywords: [
      'garden board', 'homecommandcenter', 'home command center', 'home command system', 'device', 'setup tv',
      'setup kitchen', 'setup bedroom', 'setup laundry', 'realtime', 'task board', 'debug', 'sync', 'version',
      'mounting device', 'add colour to tasks', 'add color to tasks', 'implement', 'patch', 'refactor', 'codebase'
    ],
  },
  {
    key: 'errand',
    label: 'Errand',
    keywords: [
      'buy', 'shopping', 'shop', 'store', 'post office', 'library', 'woolies', 'pharmacy', 'chemist', 'kmart', 'redeem',
      'pickup', 'pick up', 'collect', 'get another', 'parts list', 'pick up package', 'mail', 'post', 'parcel', 'package',
      'drop at', 'drop off at', 'grab', 'order', 'purchase'
    ],
  },
  {
    key: 'admin',
    label: 'Admin',
    keywords: [
      'call', 'email', 'message', 'report', 'schedule', 'appointment', 'pay', 'rego', 'bill', 'police', 'gardeners',
      'gardener', 'doctor', 'dentist', 'counseling', 'paperwork', 'forms', 'connect to', 'renew', 'cancel', 'book'
    ],
  },
  {
    key: 'home',
    label: 'Home',
    keywords: [
      'laundry', 'clean', 'cleaning', 'dishes', 'bins', 'trash', 'garbage', 'fold', 'dryer', 'washer', 'kitchen',
      'bedroom', 'bed', 'organize', 'storage', 'shed', 'patio', 'windowsill', 'windowsills', 'door', 'doors',
      'light switch', 'light switches', 'vacuum', 'rug', 'pillow', 'pillows', 'gazebo', 'desk', 'sideboard', 'cord',
      'wall', 'walls', 'robot vacuum', 'shower', 'window', 'windows', 'sliding doors', 'pool storage', 'outdoor',
      'broken window'
    ],
  },
];

HCC.tasks.CATEGORY_PRECEDENCE = [
  'work_skye',
  'child',
  'travel',
  'fitness',
  'garden',
  'creative',
  'project',
  'errand',
  'admin',
  'home',
  'general',
];

HCC.tasks.getCategorySearchParts = function getCategorySearchParts(item) {
  const parts = [];
  if (item?.manualCategory) parts.push(`manual category ${item.manualCategory}`);
  if (item?.tag) {
    parts.push(String(item.tag));
    parts.push(String(item.tag));
  }
  if (item?.title) parts.push(String(item.title));
  if (item?.description) parts.push(String(item.description));
  if (item?.sourceLabel) parts.push(String(item.sourceLabel));
  if (item?.location) parts.push(String(item.location));
  if (item?.calendarSummary) parts.push(String(item.calendarSummary));
  if (item?.kind) parts.push(String(item.kind));
  return parts;
};

HCC.tasks.normalizeCategoryHaystack = function normalizeCategoryHaystack(parts = []) {
  return parts
    .map((part) => String(part || '').toLowerCase())
    .join(' · ')
    .replace(/[’']/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

HCC.tasks.buildKeywordMatcher = function buildKeywordMatcher(keyword = '') {
  const cleaned = String(keyword || '').toLowerCase().trim();
  if (!cleaned) return null;
  const escaped = cleaned.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
  return new RegExp(`(^|\\b)${escaped}(\\b|$)`, 'i');
};

HCC.tasks.inferCategoryDetails = function inferCategoryDetails(item = {}) {
  const defs = Array.isArray(HCC.tasks.CATEGORY_DEFINITIONS) ? HCC.tasks.CATEGORY_DEFINITIONS : [];
  const searchParts = HCC.tasks.getCategorySearchParts(item);
  const sourceText = searchParts.join(' · ');
  const haystack = HCC.tasks.normalizeCategoryHaystack(searchParts);

  if (!haystack) {
    return {
      key: 'general',
      label: HCC.tasks.getCategoryLabel ? HCC.tasks.getCategoryLabel('general') : 'General',
      matchedRule: 'fallback:empty',
      matchedText: '',
      confidence: 0,
      sourceText,
    };
  }

  const hits = [];
  for (const def of defs) {
    const keywords = Array.isArray(def.keywords) ? def.keywords : [];
    let bestKeyword = '';
    for (const keyword of keywords) {
      const matcher = HCC.tasks.buildKeywordMatcher(keyword);
      if (!matcher) continue;
      if (matcher.test(haystack)) {
        if (!bestKeyword || keyword.length > bestKeyword.length) bestKeyword = keyword;
      }
    }

    if (!bestKeyword && def.pattern) {
      const regex = def.pattern instanceof RegExp ? new RegExp(def.pattern.source, def.pattern.flags.includes('i') ? def.pattern.flags : `${def.pattern.flags}i`) : null;
      const match = regex ? haystack.match(regex) : null;
      if (match) bestKeyword = match[0] || '';
    }

    if (bestKeyword) {
      hits.push({
        key: def.key,
        label: def.label,
        matchedText: bestKeyword,
        matchedRule: `keyword:${def.key}`,
        confidence: Math.min(0.98, Math.max(0.52, 0.58 + Math.min(bestKeyword.length, 16) * 0.02)),
        precedence: HCC.tasks.CATEGORY_PRECEDENCE.indexOf(def.key),
      });
    }
  }

  if (!hits.length) {
    return {
      key: 'general',
      label: HCC.tasks.getCategoryLabel ? HCC.tasks.getCategoryLabel('general') : 'General',
      matchedRule: 'fallback:general',
      matchedText: '',
      confidence: 0.2,
      sourceText,
    };
  }

  hits.sort((a, b) => {
    if (a.precedence !== b.precedence) return a.precedence - b.precedence;
    if (b.matchedText.length !== a.matchedText.length) return b.matchedText.length - a.matchedText.length;
    return b.confidence - a.confidence;
  });

  const best = hits[0];
  return {
    key: best.key,
    label: best.label,
    matchedRule: best.matchedRule,
    matchedText: best.matchedText,
    confidence: best.confidence,
    sourceText,
    candidateKeys: hits.map((hit) => hit.key),
  };
};

HCC.tasks.applyCategoryMetadata = function applyCategoryMetadata(item = {}) {
  const override = String(item?.manualCategory || item?.raw?.manual_category || item?.raw?.manualCategory || '').trim();
  if (override && override !== 'auto') {
    const label = HCC.tasks.getCategoryLabel ? HCC.tasks.getCategoryLabel(override) : override;
    return {
      ...item,
      category: override,
      categoryDebug: {
        key: override,
        label,
        matchedRule: 'manual:override',
        matchedText: override,
        confidence: 1,
        sourceText: HCC.tasks.getCategorySearchParts(item).join(' · '),
        candidateKeys: [override],
        manualOverride: true,
        inferredCategory: HCC.tasks.inferCategoryDetails({ ...item, manualCategory: '' }).key,
      },
    };
  }
  const details = HCC.tasks.inferCategoryDetails(item);
  return {
    ...item,
    category: details.key,
    categoryDebug: details,
  };
};

HCC.tasks.inferCategory = function inferCategory(item) {
  return HCC.tasks.inferCategoryDetails(item).key;
};

HCC.tasks.getCategoryLabel = function getCategoryLabel(category) {
  const defs = HCC.tasks.CATEGORY_DEFINITIONS || [];
  const match = defs.find((item) => item.key === category);
  return match?.label || 'General';
};

HCC.tasks.scoreTask = function scoreTask(task, context) {
  const now = context?.now || new Date();
  const dueBucket = context?.dueBucket || 'undated';
  const windowName = context?.windowName || 'today';
  const evening = !!context?.evening;
  let score = 0;

  if (windowName === 'today') {
    if (dueBucket === 'today') score += 42;
    else if (dueBucket === 'overdue') score += 46;
    else if (dueBucket === 'tomorrow') score += evening ? 14 : 6;
    else if (dueBucket === 'future') score -= 10;
    else if (dueBucket === 'undated') score -= 16;
  } else if (windowName === 'tomorrow') {
    if (dueBucket === 'tomorrow') score += 44;
    else if (dueBucket === 'today') score += evening ? 14 : 2;
    else if (dueBucket === 'overdue') score += 4;
    else if (dueBucket === 'future') score -= 8;
    else if (dueBucket === 'undated') score -= 16;
  }

  if (typeof isInMotionPanel === 'function' && isInMotionPanel(task?.panel)) score += 30;
  if (task?.recurrence) score += 4;
  if (task?.isMine) score += 2;

  if (task?.createdAt) {
    const createdAt = new Date(task.createdAt).getTime();
    if (Number.isFinite(createdAt)) {
      const ageHours = (now.getTime() - createdAt) / 3600000;
      if (ageHours <= 24) score += 6;
      else if (ageHours <= 72) score += 3;
    }
  }

  if (task?.dueDate) {
    const dueMs = task.dueDate.getTime();
    const nowMs = now.getTime();
    const ageDays = (nowMs - dueMs) / 86400000;
    if (dueBucket === 'overdue' && ageDays > 3) {
      score -= Math.min(28, Math.floor((ageDays - 3) * 4));
    }
    const distanceDays = Math.abs(dueMs - nowMs) / 86400000;
    score += Math.max(0, 5 - Math.floor(distanceDays));
  }

  return score;
};
