<?php

namespace App\Events;

use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;

/** One generic event: sale:created, sale:voided, stock:low, transfer:incoming, transfer:discrepancy */
class BranchBroadcast implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets;

    public function __construct(public string $name, public int $branchId, public array $payload) {}

    public function broadcastOn(): array
    {
        return [new PrivateChannel('admins'), new PrivateChannel('branch.' . $this->branchId)];
    }

    public function broadcastAs(): string
    {
        return $this->name;
    }

    public function broadcastWith(): array
    {
        return $this->payload;
    }
}
