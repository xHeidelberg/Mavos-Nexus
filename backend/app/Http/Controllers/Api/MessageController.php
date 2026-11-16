<?php

namespace App\Http\Controllers\Api;

use App\Exceptions\ApiException;
use App\Http\Controllers\Controller;
use App\Models\Branch;
use App\Models\Conversation;
use App\Models\Message;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Internal chat. Two kinds of conversation:
 *  - direct: one person to one person
 *  - branch: a room for everyone in a branch (plus admins)
 * Who can talk to whom: admins can reach everyone; everyone else can reach admins and people in their own branch.
 */
class MessageController extends Controller
{
    private function canUser(User $me, User $o): bool
    {
        return $me->role === 'admin' || $o->role === 'admin' || ($me->branch_id && (int) $me->branch_id === (int) $o->branch_id);
    }

    private function canBranch(User $me, int $branchId): bool
    {
        return $me->role === 'admin' || (int) $me->branch_id === $branchId;
    }

    private function accessibleIds(User $me)
    {
        return Conversation::where(fn ($q) => $q->where('type', 'direct')->where(fn ($w) => $w->where('user_low', $me->id)->orWhere('user_high', $me->id)))
            ->orWhere(fn ($q) => $q->where('type', 'branch')->when($me->role !== 'admin', fn ($w) => $w->where('branch_id', $me->branch_id)))
            ->pluck('id');
    }

    /** conversation_id => unread count (messages from other people after my last read). */
    private function unreadMap(User $me, $ids)
    {
        if ($ids->isEmpty()) return collect();
        return DB::table('messages as m')
            ->leftJoin('conversation_reads as r', fn ($j) => $j->on('r.conversation_id', '=', 'm.conversation_id')->where('r.user_id', $me->id))
            ->whereIn('m.conversation_id', $ids)->where('m.sender_id', '!=', $me->id)
            ->whereRaw('m.id > COALESCE(r.last_read_message_id, 0)')
            ->groupBy('m.conversation_id')->selectRaw('m.conversation_id, COUNT(*) as n')->pluck('n', 'conversation_id');
    }

    private function lastMap($ids)
    {
        if ($ids->isEmpty()) return collect();
        $lastIds = Message::whereIn('conversation_id', $ids)->groupBy('conversation_id')->selectRaw('MAX(id) as id')->pluck('id');
        return Message::whereIn('id', $lastIds)->get()->keyBy('conversation_id');
    }

    private function find(User $me, string $type, ?int $userId, ?int $branchId, bool $create): array
    {
        if ($type === 'direct') {
            $other = User::where('is_active', true)->findOrFail($userId);
            if ($other->id === $me->id) throw new ApiException('You can’t message yourself.', 422);
            if (!$this->canUser($me, $other)) throw new ApiException('You can only message admins and people in your branch.', 403);
            [$lo, $hi] = $me->id < $other->id ? [$me->id, $other->id] : [$other->id, $me->id];
            $key = ['type' => 'direct', 'user_low' => $lo, 'user_high' => $hi];
            $conv = $create ? Conversation::firstOrCreate($key) : Conversation::where($key)->first();
            return [$conv, $other->full_name];
        }
        if (!$this->canBranch($me, (int) $branchId)) throw new ApiException('You can only open your own branch’s room.', 403);
        $branch = Branch::findOrFail($branchId);
        $key = ['type' => 'branch', 'branch_id' => $branch->id];
        $conv = $create ? Conversation::firstOrCreate($key) : Conversation::where($key)->first();
        return [$conv, $branch->name . ' team'];
    }

    private function target(Request $r): array
    {
        $d = $r->validate([
            'type' => 'required|in:direct,branch',
            'user_id' => 'required_if:type,direct|nullable|integer',
            'branch_id' => 'required_if:type,branch|nullable|integer',
        ]);
        return [$d['type'], $d['user_id'] ?? null, $d['branch_id'] ?? null];
    }

    private function markRead(User $me, int $convId, int $messageId): void
    {
        DB::table('conversation_reads')->upsert([['conversation_id' => $convId, 'user_id' => $me->id, 'last_read_message_id' => $messageId]],
            ['conversation_id', 'user_id'], ['last_read_message_id']);
    }

    private function shape(Message $m): array
    {
        return ['id' => $m->id, 'sender_id' => $m->sender_id, 'sender_name' => $m->sender?->full_name, 'body' => $m->body, 'created_at' => $m->created_at];
    }

    // People and branch rooms, with search, branch filter and sorting.
    public function contacts(Request $r)
    {
        $me = $r->user();
        $d = $r->validate(['search' => 'nullable|string|max:60', 'branch_id' => 'nullable|integer', 'sort' => 'nullable|in:recent,name,branch']);
        $search = trim((string) ($d['search'] ?? ''));
        $sort = $d['sort'] ?? 'recent';

        $users = User::with('branch:id,name')->where('is_active', true)->where('id', '!=', $me->id)
            ->when($me->role !== 'admin', fn ($q) => $q->where(fn ($w) => $w->where('role', 'admin')->orWhere('branch_id', $me->branch_id)))
            ->when(!empty($d['branch_id']), fn ($q) => $q->where('branch_id', $d['branch_id']))
            ->when($search !== '', fn ($q) => $q->where(fn ($w) => $w->where('full_name', 'like', "%$search%")->orWhere('username', 'like', "%$search%")
                ->orWhereHas('branch', fn ($b) => $b->where('name', 'like', "%$search%"))))
            ->get();

        $direct = Conversation::where('type', 'direct')->where(fn ($q) => $q->where('user_low', $me->id)->orWhere('user_high', $me->id))->get()
            ->keyBy(fn ($c) => (int) $c->user_low === $me->id ? $c->user_high : $c->user_low);
        $rooms = Conversation::where('type', 'branch')->get()->keyBy('branch_id');

        $ids = $direct->pluck('id')->merge($rooms->pluck('id'))->values();
        $unread = $this->unreadMap($me, $ids);
        $last = $this->lastMap($ids);

        $people = $users->map(function ($u) use ($direct, $unread, $last) {
            $c = $direct->get($u->id);
            $m = $c ? $last->get($c->id) : null;
            return ['id' => $u->id, 'full_name' => $u->full_name, 'username' => $u->username, 'role' => $u->role,
                'branch_id' => $u->branch_id, 'branch_name' => $u->branch?->name,
                'last_message' => $m?->body, 'last_at' => $m?->created_at?->format('Y-m-d H:i:s'), 'unread' => (int) ($c ? ($unread[$c->id] ?? 0) : 0)];
        });

        $branches = Branch::where('is_active', true)
            ->when($me->role !== 'admin', fn ($q) => $q->where('id', $me->branch_id))
            ->when(!empty($d['branch_id']), fn ($q) => $q->where('id', $d['branch_id']))
            ->when($search !== '', fn ($q) => $q->where('name', 'like', "%$search%"))->get()
            ->map(function ($b) use ($rooms, $unread, $last) {
                $c = $rooms->get($b->id);
                $m = $c ? $last->get($c->id) : null;
                return ['id' => $b->id, 'name' => $b->name, 'last_message' => $m?->body, 'last_at' => $m?->created_at?->format('Y-m-d H:i:s'),
                    'unread' => (int) ($c ? ($unread[$c->id] ?? 0) : 0)];
            });

        $byRecent = fn ($a, $b) => strcmp($b['last_at'] ?? '', $a['last_at'] ?? '') ?: strcasecmp($a['full_name'] ?? $a['name'], $b['full_name'] ?? $b['name']);
        $people = match ($sort) {
            'name' => $people->sort(fn ($a, $b) => strcasecmp($a['full_name'], $b['full_name'])),
            'branch' => $people->sort(fn ($a, $b) => strcasecmp(($a['branch_name'] ?? 'zzz') . $a['full_name'], ($b['branch_name'] ?? 'zzz') . $b['full_name'])),
            default => $people->sort($byRecent),
        };
        $branches = $sort === 'recent' ? $branches->sort($byRecent) : $branches->sort(fn ($a, $b) => strcasecmp($a['name'], $b['name']));

        return ['people' => $people->values(), 'branches' => $branches->values()];
    }

    public function thread(Request $r)
    {
        $me = $r->user();
        [$type, $userId, $branchId] = $this->target($r);
        [$conv, $title] = $this->find($me, $type, $userId, $branchId, false);
        if (!$conv) return ['conversation_id' => null, 'title' => $title, 'messages' => []];

        $messages = Message::with('sender:id,full_name')->where('conversation_id', $conv->id)->orderByDesc('id')->limit(150)->get()->reverse()->values();
        if ($messages->isNotEmpty()) $this->markRead($me, $conv->id, $messages->last()->id);
        return ['conversation_id' => $conv->id, 'title' => $title, 'messages' => $messages->map(fn ($m) => $this->shape($m))];
    }

    public function send(Request $r)
    {
        $me = $r->user();
        [$type, $userId, $branchId] = $this->target($r);
        $d = $r->validate(['body' => 'required|string|max:2000']);
        $body = trim($d['body']);
        if ($body === '') throw new ApiException('Type a message first.', 422);

        [$conv] = $this->find($me, $type, $userId, $branchId, true);
        $m = Message::create(['conversation_id' => $conv->id, 'sender_id' => $me->id, 'body' => $body]);
        $conv->update(['last_message_at' => now()]);
        $this->markRead($me, $conv->id, $m->id);
        return response()->json($this->shape($m->load('sender:id,full_name')), 201);
    }

    public function unread(Request $r)
    {
        $me = $r->user();
        return ['unread' => (int) $this->unreadMap($me, $this->accessibleIds($me))->sum()];
    }

    // Find a message by its words, across the conversations I'm allowed to see.
    public function search(Request $r)
    {
        $me = $r->user();
        $d = $r->validate(['q' => 'required|string|min:2|max:60']);
        $ids = $this->accessibleIds($me);
        $convs = Conversation::whereIn('id', $ids)->get()->keyBy('id');
        $branches = Branch::pluck('name', 'id');
        $names = User::pluck('full_name', 'id');

        $rows = Message::with('sender:id,full_name')->whereIn('conversation_id', $ids)
            ->where('body', 'like', '%' . str_replace(['%', '_'], ['\%', '\_'], $d['q']) . '%')->orderByDesc('id')->limit(30)->get();

        return $rows->map(function ($m) use ($convs, $me, $branches, $names) {
            $c = $convs[$m->conversation_id];
            $direct = $c->type === 'direct';
            $other = $direct ? ((int) $c->user_low === $me->id ? $c->user_high : $c->user_low) : null;
            return ['id' => $m->id, 'body' => $m->body, 'created_at' => $m->created_at, 'sender_name' => $m->sender?->full_name,
                'type' => $c->type, 'user_id' => $other, 'branch_id' => $c->branch_id,
                'label' => $direct ? ($names[$other] ?? 'Unknown') : ($branches[$c->branch_id] ?? 'Branch') . ' team'];
        })->values();
    }
}
