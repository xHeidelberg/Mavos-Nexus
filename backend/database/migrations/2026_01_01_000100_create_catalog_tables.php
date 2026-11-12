<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        // The category is how an item is "identified": vape, apparel, accessories, ...
        // It decides whether items expire and whether they come in variants (size, color).
        Schema::create('product_categories', function (Blueprint $t) {
            $t->id();
            $t->string('name', 60)->unique();
            $t->boolean('tracks_expiry')->default(false);
            $t->unsignedSmallInteger('default_shelf_life_months')->nullable(); // vape: 24
            $t->boolean('has_variants')->default(false);
            $t->json('variant_options')->nullable();                           // apparel: ["size","color"]
            $t->boolean('is_active')->default(true);
            $t->timestamps();
        });

        Schema::create('products', function (Blueprint $t) {
            $t->id();
            $t->foreignId('category_id')->constrained('product_categories');
            $t->string('name', 150)->index();
            $t->string('brand', 80)->nullable();
            $t->text('description')->nullable();
            // Optional per-product override of the category rule (null = inherit from category).
            $t->boolean('tracks_expiry')->nullable();
            $t->unsignedSmallInteger('shelf_life_months')->nullable();
            $t->boolean('is_active')->default(true);
            $t->timestamps();
        });

        // The sellable / stockable unit (SKU). A simple item has exactly one variant.
        Schema::create('product_variants', function (Blueprint $t) {
            $t->id();
            $t->foreignId('product_id')->constrained('products')->cascadeOnDelete();
            $t->string('sku', 50)->unique();
            $t->string('barcode', 50)->nullable()->unique();
            $t->string('label', 100)->nullable();          // e.g. "M / Black"
            $t->json('attributes')->nullable();            // e.g. {"size":"M","color":"Black"}
            $t->decimal('cost_price', 12, 2);              // puhunan per unit
            $t->decimal('base_price', 12, 2);              // price floor (seller may not go below)
            $t->decimal('selling_price', 12, 2);           // list price
            $t->unsignedInteger('low_stock_threshold')->default(5);
            $t->boolean('is_active')->default(true);
            $t->timestamps();
        });
        DB::statement('ALTER TABLE product_variants ADD CONSTRAINT price_floor CHECK (base_price <= selling_price)');

        Schema::create('suppliers', function (Blueprint $t) {
            $t->id();
            $t->string('name', 120);
            $t->string('contact_person', 100)->nullable();
            $t->string('contact_number', 30)->nullable();
            $t->text('address')->nullable();
            $t->boolean('is_active')->default(true);
            $t->timestamps();
        });

        Schema::create('customers', function (Blueprint $t) {
            $t->id();
            $t->string('name', 120);
            $t->string('contact_number', 30)->nullable()->unique();
            $t->integer('loyalty_points')->default(0);
            $t->timestamps();
        });
    }

    public function down(): void
    {
        foreach (['customers', 'suppliers', 'product_variants', 'products', 'product_categories'] as $t) {
            Schema::dropIfExists($t);
        }
    }
};
