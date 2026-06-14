import type { Person } from './types';

// 重複候補の名寄せ（純関数。server-only を付けず、クライアント/テスト双方で使う）。
// docs/PRODUCT_SPEC.md §6.3「類似名がある場合は重複候補を表示」。

export type PersonLike = Pick<
  Person,
  'id' | 'display_name' | 'furigana' | 'relationship_status' | 'age_group' | 'archived_at'
>;

export interface DuplicateCandidate {
  person: PersonLike;
  score: number; // 0..1（高いほど類似）
  reason: 'exact' | 'partial' | 'fuzzy';
}

// カタカナ→ひらがな（U+30A1..U+30F6 を -0x60）。
function kataToHira(s: string): string {
  return s.replace(/[ァ-ヶ]/g, (c) =>
    String.fromCharCode(c.charCodeAt(0) - 0x60),
  );
}

// 日本語名の正規化。
//  1) NFKC で全角英数・半角カナを統一
//  2) カタカナ→ひらがなに寄せる
//  3) 空白(全半角)・中黒・長音・記号を除去
//  4) 小文字化（ローマ字名対策）
// ※ NFKC → kataToHira の順を守る（半角カナは NFKC で全角化してから吸収）。
export function normalizeName(raw: string | null | undefined): string {
  if (!raw) return '';
  let s = raw.normalize('NFKC');
  s = kataToHira(s);
  s = s.replace(/[\s　・･ー\-‐―—~〜.,。、]/g, '');
  return s.toLowerCase();
}

// Levenshtein 距離（短い氏名想定。O(n*m)）。
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const prev = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(
        prev[j] + 1,
        prev[j - 1] + 1,
        diag + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      diag = tmp;
    }
  }
  return prev[b.length];
}

function similarity(a: string, b: string): number {
  if (!a && !b) return 0;
  const dist = levenshtein(a, b);
  const max = Math.max(a.length, b.length);
  return max === 0 ? 0 : 1 - dist / max;
}

export interface MatchOptions {
  threshold?: number; // fuzzy 採用の下限（既定 0.7）
  limit?: number; // 上位件数（既定 5）
  excludeId?: string; // 統合用途などで自分自身を除外
}

// 入力(名前・フリガナ)に対する重複候補を score 降順で返す。純関数。
// 設計方針: 過剰検出(false positive)より取りこぼし(false negative)側に倒す。
export function matchDuplicateCandidates(
  input: { displayName: string; furigana?: string | null },
  people: PersonLike[],
  opts: MatchOptions = {},
): DuplicateCandidate[] {
  const threshold = opts.threshold ?? 0.7;
  const limit = opts.limit ?? 5;

  const inName = normalizeName(input.displayName);
  const inFuri = normalizeName(input.furigana);
  const inKeys = [inName, inFuri].filter(Boolean);
  if (inKeys.length === 0) return [];

  const out: DuplicateCandidate[] = [];
  for (const p of people) {
    if (p.archived_at) continue;
    if (opts.excludeId && p.id === opts.excludeId) continue;

    const pKeys = [normalizeName(p.display_name), normalizeName(p.furigana)].filter(
      Boolean,
    );
    if (pKeys.length === 0) continue;

    let best = 0;
    let reason: DuplicateCandidate['reason'] = 'fuzzy';
    for (const a of inKeys) {
      for (const b of pKeys) {
        if (a === b) {
          best = 1;
          reason = 'exact';
          break;
        }
        // 入力途中でも拾えるよう、2文字以上の包含を部分一致として加点
        if (a.length >= 2 && (b.includes(a) || a.includes(b))) {
          if (0.9 > best) {
            best = 0.9;
            reason = 'partial';
          }
        }
        const sim = similarity(a, b);
        if (sim > best) {
          best = sim;
          reason = 'fuzzy';
        }
      }
      if (best === 1) break;
    }
    if (best >= threshold) out.push({ person: p, score: best, reason });
  }

  out.sort(
    (x, y) =>
      y.score - x.score ||
      x.person.display_name.localeCompare(y.person.display_name, 'ja'),
  );
  return out.slice(0, limit);
}
