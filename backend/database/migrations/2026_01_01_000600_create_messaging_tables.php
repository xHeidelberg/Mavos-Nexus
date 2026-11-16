<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        // type = direct (two people) or branch (everyone in a branch + admins)
        Schema::create('conversations', function (Blueprint $t) {
            $t->id();
            $t->string('type', 10);
            $t->foreignId('branch_id')->nullable()->constrained('branches');
            $t->foreignId('user_low')->nullable()->constrained('users');   // smaller user id of a direct chat
            $t->foreignId('user_high')->nullable()->constrained('users');
            $t->timestamp('last_message_at')->nullable();
            $t->timestamps();
            $t->unique(['type', 'user_low', 'user_high']);
            $t->unique(['type', 'branch_id']);
        });

        Schema::create('messages', function (Blueprint $t) {
            $t->id();
            $t->foreignId('conversation_id')->constrained('conversations')->cascadeOnDelete();
            $t->foreignId('sender_id')->constrained('users');
            $t->text('body');
            $t->timestamp('created_at')->useCurrent();
            $t->index(['conversation_id', 'id']);
        });

        Schema::create('conversation_reads', function (Blueprint $t) {
            $t->foreignId('conversation_id')->constrained('conversations')->cascadeOnDelete();
            $t->foreignId('user_id')->constrained('users');
            $t->unsignedBigInteger('last_read_message_id')->default(0);
            $t->primary(['conversation_id', 'user_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('conversation_reads');
        Schema::dropIfExists('messages');
        Schema::dropIfExists('conversations');
    }
};
