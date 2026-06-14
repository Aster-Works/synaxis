import { getActiveChurch } from '@/app/lib/auth';
import { createSupabaseServerClient } from '@/app/lib/supabase/server';
import type { Person } from '@/app/lib/types';
import { PeopleList } from './PeopleList';
import { AddPersonForm } from './AddPersonForm';

export default async function PeoplePage() {
  const active = await getActiveChurch();
  if (!active) return null;

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('people')
    .select('*')
    .eq('church_id', active.church_id)
    .is('archived_at', null)
    .order('furigana', { ascending: true, nullsFirst: false });
  const people = (data ?? []) as Person[];
  const canMerge = ['owner', 'admin'].includes(active.role);
  const canAdd = ['owner', 'admin', 'receptionist'].includes(active.role);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-slate-900">人物</h1>
      {canAdd && <AddPersonForm childLabel={active.church.child_label} />}
      <PeopleList people={people} canMerge={canMerge} />
    </div>
  );
}
