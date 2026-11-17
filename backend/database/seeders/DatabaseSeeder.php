<?php

namespace Database\Seeders;

use App\Models\Branch;
use App\Models\ProductCategory;
use App\Models\Setting;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Str;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        $main = Branch::firstOrCreate(['code' => 'MAIN'], ['name' => 'Main Inventory', 'is_main' => true]);

        // Starter categories: edit or add more from the admin screen.
        ProductCategory::firstOrCreate(['name' => 'Vape'], ['tracks_expiry' => true, 'default_shelf_life_months' => 24, 'has_variants' => false]);
        ProductCategory::firstOrCreate(['name' => 'Apparel'], ['tracks_expiry' => false, 'has_variants' => true, 'variant_options' => ['size', 'color']]);
        ProductCategory::firstOrCreate(['name' => 'Accessories'], ['tracks_expiry' => false, 'has_variants' => false]);

        Setting::firstOrCreate(['key' => 'expiry_alert_days'], ['value' => 90]);
        Setting::firstOrCreate(['key' => 'loyalty_peso_per_point'], ['value' => 100]);

        if (!User::where('role', 'admin')->exists()) {
            $pass = env('SEED_ADMIN_PASSWORD') ?: Str::random(10);
            User::create(['username' => 'admin', 'full_name' => 'Administrator', 'role' => 'admin',
                'branch_id' => $main->id, 'password' => $pass, 'must_change_password' => true]);
            $this->command?->info("Admin created. username: admin   temporary password: {$pass}   (change it at first login)");
        }
    }
}
