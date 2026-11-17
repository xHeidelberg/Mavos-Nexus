<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        // A batch = one lot received (carries the expiry date when the item expires).
        Schema::create('stock_batches', function (Blueprint $t) {
            $t->id();
            $t->foreignId('variant_id')->constrained('product_variants');
            $t->foreignId('supplier_id')->nullable()->constrained('suppliers');
            $t->string('batch_no', 60);
            $t->date('received_at');
            $t->date('expiry_date')->nullable()->index();
            $t->unsignedInteger('qty_received');
            $t->foreignId('created_by')->nullable()->constrained('users');
            $t->timestamps();
            $t->unique(['variant_id', 'batch_no']);
        });

        // Current stock per location per batch. Negative only via offline sync (sale gets flagged).
        Schema::create('branch_stock', function (Blueprint $t) {
            $t->foreignId('branch_id')->constrained('branches');
            $t->foreignId('batch_id')->constrained('stock_batches');
            $t->foreignId('variant_id')->constrained('product_variants');
            $t->integer('quantity')->default(0);
            $t->primary(['branch_id', 'batch_id']);
            $t->index(['branch_id', 'variant_id']);
        });

        // Immutable ledger of every stock change.
        Schema::create('stock_movements', function (Blueprint $t) {
            $t->id();
            $t->foreignId('variant_id')->constrained('product_variants');
            $t->foreignId('batch_id')->nullable()->constrained('stock_batches');
            $t->foreignId('branch_id')->constrained('branches');
            $t->integer('qty_change');
            // stock_in, transfer_out, transfer_in, transfer_cancel, sale, void_restore,
            // exchange_return, exchange_out, adjustment
            $t->string('movement_type', 20);
            $t->string('ref_table', 30)->nullable();
            $t->unsignedBigInteger('ref_id')->nullable();
            $t->text('note')->nullable();
            $t->foreignId('user_id')->nullable()->constrained('users');
            $t->timestamp('created_at')->useCurrent();
            $t->index(['branch_id', 'created_at']);
            $t->index(['ref_table', 'ref_id']);
        });

        Schema::create('stock_transfers', function (Blueprint $t) {
            $t->id();
            $t->string('transfer_no', 30)->unique();
            $t->foreignId('from_branch_id')->constrained('branches');
            $t->foreignId('to_branch_id')->constrained('branches');
            $t->string('status', 12)->default('in_transit'); // in_transit | received | cancelled
            $t->boolean('has_discrepancy')->default(false);
            $t->text('note')->nullable();
            $t->foreignId('created_by')->constrained('users');
            $t->foreignId('received_by')->nullable()->constrained('users');
            $t->timestamp('received_at')->nullable();
            $t->timestamps();
        });

        Schema::create('stock_transfer_items', function (Blueprint $t) {
            $t->id();
            $t->foreignId('transfer_id')->constrained('stock_transfers')->cascadeOnDelete();
            $t->foreignId('variant_id')->constrained('product_variants');
            $t->foreignId('batch_id')->constrained('stock_batches');
            $t->unsignedInteger('qty');
            $t->unsignedInteger('received_qty')->nullable();
        });

        Schema::create('stock_adjustments', function (Blueprint $t) {
            $t->id();
            $t->foreignId('branch_id')->constrained('branches');
            $t->foreignId('variant_id')->constrained('product_variants');
            $t->foreignId('batch_id')->constrained('stock_batches');
            $t->integer('qty_change');
            $t->text('reason');
            $t->foreignId('created_by')->constrained('users');
            $t->foreignId('approved_by')->constrained('users'); // whose PIN authorised it
            $t->timestamps();
        });
    }

    public function down(): void
    {
        foreach (['stock_adjustments', 'stock_transfer_items', 'stock_transfers', 'stock_movements', 'branch_stock', 'stock_batches'] as $t) {
            Schema::dropIfExists($t);
        }
    }
};
