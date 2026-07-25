import { upsertPersonSchema } from './validation';
import type { RelationshipStatus, AgeGroup } from './types';

// ── CSV（人物一覧エクスポート互換）を名簿へ取り込むための純ロジック ───────────
// 取得・挿入（IO）は server action 側。ここは解析・検証のみ＝単体テスト可能。

// RFC4180 風の最小 CSV パーサ（BOM・引用符・"" エスケープ・CRLF/LF 対応）。
export function parseCsv(text: string): string[][] {
  const s = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text; // BOM 除去
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
      continue;
    }
    if (c === '"') inQuotes = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (c !== '\r') field += c;
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

// エクスポート時のフォーミュラインジェクション対策（先頭 '）を取り込み時に解除。
function unescapeCell(cell: string): string {
  if (cell.length >= 2 && cell[0] === "'" && '=+-@'.includes(cell[1])) {
    return cell.slice(1);
  }
  return cell;
}

// 重複判定用に氏名を正規化（NFKC・空白畳み込み）。
export function normName(name: string): string {
  return name.normalize('NFKC').replace(/\s+/g, ' ').trim();
}

function relFromLabel(label: string): RelationshipStatus {
  switch (label.trim()) {
    case '会員':
      return 'member';
    case '客員':
      return 'regular_attendee';
    case '未信':
    case '未信者':
      return 'seeker';
    case 'ビジター':
    case 'ゲスト':
      return 'guest';
    default:
      return 'regular_attendee'; // 不明/空欄は客員（中立）
  }
}

function ageFromLabel(label: string): AgeGroup {
  switch (label.trim()) {
    case '子ども':
    case '子供':
      return 'child';
    case '不明':
      return 'unknown';
    case '大人':
      return 'adult';
    default:
      return 'adult'; // 空欄/不明表記は大人
  }
}

export interface ParsedPersonRow {
  display_name: string;
  furigana: string | null;
  relationship_status: RelationshipStatus;
  age_group: AgeGroup;
  first_visit_on: string | null;
}

export interface ImportParseResult {
  rows: ParsedPersonRow[]; // 取り込む新規行
  skippedExisting: number; // 既存（同名）でスキップ
  errors: string[]; // 行単位のエラー（先頭から最大20件）
  headerError?: string; // ヘッダ不備（致命）
}

// CSV テキストと「既存の氏名（正規化済み）集合」から、取り込む人物行を組み立てる。
export function parsePeopleCsv(
  text: string,
  existingNames: Set<string>,
): ImportParseResult {
  // 空行は除外しつつ、エラー表示用に元の行番号（1始まり）を保持する。
  const all = parseCsv(text)
    .map((cells, idx) => ({ cells, rowNo: idx + 1 }))
    .filter(({ cells }) => cells.some((c) => c.trim() !== ''));
  if (all.length < 2) {
    return { rows: [], skippedExisting: 0, errors: [], headerError: 'データ行がありません（ヘッダ＋1行以上が必要です）' };
  }

  const header = all[0].cells.map((h) => unescapeCell(h).trim());
  const col = (...names: string[]) => header.findIndex((h) => names.includes(h));
  const iName = col('氏名', '名前');
  if (iName < 0) {
    return { rows: [], skippedExisting: 0, errors: [], headerError: 'ヘッダに「氏名」列が見つかりません' };
  }
  const iFuri = col('ふりがな', 'フリガナ');
  const iRel = col('立場', '現在の立場');
  const iAge = col('年齢区分');
  const iFirst = col('初回出席');

  const seen = new Set(existingNames);
  const rows: ParsedPersonRow[] = [];
  const errors: string[] = [];
  let skippedExisting = 0;

  for (let r = 1; r < all.length; r++) {
    const cells = all[r].cells.map(unescapeCell);
    const name = (cells[iName] ?? '').trim();
    if (!name) continue; // 空行はスキップ
    const key = normName(name);
    if (seen.has(key)) {
      skippedExisting += 1;
      continue;
    }
    const furi = iFuri >= 0 ? (cells[iFuri] ?? '').trim() : '';
    const first = iFirst >= 0 ? (cells[iFirst] ?? '').trim() : '';
    const parsed = upsertPersonSchema.safeParse({
      displayName: name,
      furigana: furi || undefined,
      relationshipStatus: relFromLabel(iRel >= 0 ? cells[iRel] ?? '' : ''),
      ageGroup: ageFromLabel(iAge >= 0 ? cells[iAge] ?? '' : ''),
      firstVisitOn: /^\d{4}-\d{2}-\d{2}$/.test(first) ? first : undefined,
    });
    if (!parsed.success) {
      if (errors.length < 20) {
        errors.push(`${all[r].rowNo}行目「${name}」: ${parsed.error.issues[0]?.message ?? '入力エラー'}`);
      }
      continue;
    }
    seen.add(key); // ファイル内の重複も1件に
    rows.push({
      display_name: parsed.data.displayName,
      furigana: parsed.data.furigana ?? null,
      relationship_status: parsed.data.relationshipStatus,
      age_group: parsed.data.ageGroup,
      first_visit_on: parsed.data.firstVisitOn ?? null,
    });
  }

  return { rows, skippedExisting, errors };
}
