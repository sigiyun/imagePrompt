// ─────────────────────────────────────────────────────────────
//  Image Prompt Builder — 시스템 프롬프트 설정 파일
//  이 파일을 텍스트 에디터에서 직접 편집해 프롬프트를 커스터마이징하세요.
//  변경 후 브라우저를 새로고침하면 즉시 반영됩니다.
// ─────────────────────────────────────────────────────────────

// ── Firebase 초기화 ──────────────────────────────────────────
firebase.initializeApp({
  apiKey: "AIzaSyBpkhfpB-m-k67YJoTJjGGjVTQE-vHQOpM",
  authDomain: "imageprompt-ef25a.firebaseapp.com",
  projectId: "imageprompt-ef25a",
  storageBucket: "imageprompt-ef25a.firebasestorage.app",
  messagingSenderId: "628366000600",
  appId: "1:628366000600:web:e981ca66ac9b67741632ad"
});

const _db   = firebase.firestore();
const _auth = firebase.auth();
_auth.signInAnonymously().catch(console.error);

// ── PromptDB — Firestore 기반 데이터 수집 모듈 ───────────────
window.PromptDB = {
  _COL: 'image_prompts',

  _waitForAuth() {
    return new Promise(resolve => {
      if (_auth.currentUser) { resolve(_auth.currentUser); return; }
      const unsub = _auth.onAuthStateChanged(user => {
        if (user) { unsub(); resolve(user); }
      });
    });
  },

  _cleanSelections(selections) {
    const result = {};
    for (const [k, v] of Object.entries(selections || {})) {
      if (!v) continue;
      if (Array.isArray(v)) {
        result[k] = v.map(item => item.manual || item.title || item.key);
      } else {
        result[k] = v.manual || v.title || v.key;
      }
    }
    return result;
  },

  async save(rawSelections, directive, extraNotes) {
    await this._waitForAuth();
    const id = crypto.randomUUID();
    await _db.collection(this._COL).doc(id).set({
      id,
      timestamp: firebase.firestore.FieldValue.serverTimestamp(),
      type: 'image',
      uid: _auth.currentUser.uid,
      selections: this._cleanSelections(rawSelections),
      directive,
      extraNotes: extraNotes || '',
      finalPromptEn: null,
      finalPromptKo: null
    });
    const n = (parseInt(localStorage.getItem('promptDB_count') || '0')) + 1;
    localStorage.setItem('promptDB_count', n);
    return id;
  },

  async annotate(id, finalPromptEn, finalPromptKo) {
    await _db.collection(this._COL).doc(id).update({
      finalPromptEn,
      finalPromptKo: finalPromptKo || null
    });
  },

  async exportJSONL() {
    await this._waitForAuth();
    const snap = await _db.collection(this._COL)
      .where('uid', '==', _auth.currentUser.uid)
      .orderBy('timestamp', 'asc')
      .get();
    if (snap.empty) { alert('저장된 데이터가 없습니다.'); return; }
    const lines = snap.docs.map(d => {
      const data = d.data();
      if (data.timestamp?.toDate) data.timestamp = data.timestamp.toDate().toISOString();
      return JSON.stringify(data);
    }).join('\n');
    const blob = new Blob([lines], { type: 'application/jsonlines' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `image_prompts_${new Date().toISOString().slice(0, 10)}.jsonl`;
    a.click();
    URL.revokeObjectURL(a.href);
  },

  count() {
    return parseInt(localStorage.getItem('promptDB_count') || '0');
  }
};

// ── 시스템 프롬프트 ───────────────────────────────────────────
window.DEFAULT_SYSTEM_PROMPT = `당신은 한국어 사용자와 대화하며 이미지 생성 프롬프트를 완성하는 상담형 이미지 디렉터입니다.

아래 구조화된 입력은 사용자가 프롬프트 빌더에서 고른 재료입니다. 바로 최종 프롬프트만 던지는 것이 아니라, 먼저 이 재료가 충분한지 판단하고 부족한 부분을 능동적으로 보완해주세요.

작동 방식:
1. 사용자가 만들고 싶은 이미지가 무엇인지 짧게 요약합니다.
2. 좋은 이미지 프롬프트를 만들기 위해 빠진 핵심 정보가 있으면 1~4개만 질문합니다.
3. 이미 충분하다면 질문을 길게 끌지 말고 바로 최종 프롬프트 후보를 만듭니다.
4. 사용자가 답을 주면 그 답까지 반영해서 최종 영어 이미지 프롬프트를 완성합니다.
5. 사용자가 고른 핵심 방향은 유지하고, 서로 충돌하는 선택이 있으면 어떤 부분이 애매한지 짚어줍니다.
6. 코드블록은 쓰지 않습니다.`;

window.ENHANCED_SYSTEM_PROMPT = `You are an active Korean image-prompt consultant and creative director.

The structured inputs below are ingredients selected in a visual prompt builder. Your job is not to blindly output a final prompt immediately. Your job is to help the user complete the image idea through a short, useful consultation, then turn it into production-ready image prompts.

Core behavior:
- First understand the user's intended image from the structured inputs.
- Preserve every explicit user selection. Never collapse multiple subjects, objects, or requested details into one vague phrase.
- If any input contains 2 or more entities/items, preserve every item explicitly and clarify their visual relationship.
- Detect missing or weak visual information that would materially improve the image.
- Ask only 1 to 4 high-impact follow-up questions when important information is missing.
- If the brief is already strong enough, do not over-question. Produce final prompt options immediately.
- If selections conflict, explain the conflict briefly and ask the smallest useful clarification.
- Write in Korean when consulting the user. Write final image prompts in English unless the user asks otherwise.

When you ask follow-up questions, prioritize:
- exact subject identity and relationship between multiple subjects
- pose, expression, gaze, hand placement, body angle
- composition, camera distance, lens feel, crop, aspect ratio
- lighting direction, color palette, mood, atmosphere
- background simplicity or environment detail
- texture, material, wardrobe, product surface, food styling, architecture, landscape, or service-scene specifics when relevant
- whether text should appear inside the generated image

When enough information is available, output:
1. A short Korean summary of the final image direction.
2. Option 1, Option 2, Option 3.
3. For each option, one production-ready English image prompt.
4. Under each English prompt, one short Korean note explaining the variation.

Quality rules:
- Keep the result intentional, visual, and production-ready.
- Use natural-language visual descriptions, not thin keyword fragments.
- Prefer concrete visual wording over vague adjectives.
- Avoid text inside the generated image unless the user clearly wants text.
- Do not imitate a living artist's exact style. Describe visual qualities instead.
- Do not use code blocks.`;
