import { useState } from 'react';
import { useSpace } from '../lib/space';
import { Button, Skeleton } from '../components/ui';
import { CreateRoomSheet, JoinRoomSheet, RoomCard } from '../components/RoomBits';

export default function Rooms() {
  const space = useSpace();
  const [sheet, setSheet] = useState<'create' | 'join' | null>(null);
  const limits = space.plan.limits;
  return <div className="page">
    <div className="row between wrap gap-16">
      <div className="col gap-4"><h1 className="display" style={{ fontSize: 40 }}>Rooms</h1><p className="muted small">{limits ? `${space.plan.usage.rooms} of ${limits.rooms} rooms you host on the free plan` : 'Unlimited rooms with Plus'}</p></div>
      <div className="row gap-8"><Button variant="secondary" icon="enter" onClick={() => setSheet('join')}>Join with code</Button><Button icon="plus" onClick={() => setSheet('create')}>Create a room</Button></div>
    </div>
    <div style={{ marginTop: 28 }}>
      {!space.synced ? <div className="posters">{[0, 1, 2].map(i => <Skeleton key={i} h={300} r={26} />)}</div>
        : space.rooms.length ? <div className="posters">{space.rooms.map(r => <RoomCard key={r.code} room={r} />)}</div>
          : <div className="glass window col gap-16" style={{ padding: 40, alignItems: 'flex-start' }}><h2 className="h2">No rooms yet</h2><p className="muted">Create one, or join with a code someone sent you.</p><div className="row gap-8"><Button icon="plus" onClick={() => setSheet('create')}>Create a room</Button><Button variant="secondary" onClick={() => setSheet('join')}>Join with code</Button></div></div>}
    </div>
    {sheet === 'create' && <CreateRoomSheet onClose={() => setSheet(null)} />}
    {sheet === 'join' && <JoinRoomSheet onClose={() => setSheet(null)} />}
  </div>;
}
