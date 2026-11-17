<?php

namespace App\Http\Controllers\Api;

use App\Exceptions\ApiException;
use App\Http\Controllers\Controller;
use App\Models\Branch;
use App\Models\Product;
use App\Models\ProductCategory;
use App\Models\ProductVariant;
use App\Services\AuditService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ProductController extends Controller
{
    // Products with variants and on-hand stock for the user's branch (admin may pass ?branch_id=).
    public function index(Request $r)
    {
        $u = $r->user();
        $branch = $u->role === 'admin' ? ($r->query('branch_id') ?: Branch::mainId()) : $u->branch_id;
        $search = trim((string) $r->query('search', ''));

        $products = Product::with([
            'category',
            'variants' => fn ($q) => $q->where('is_active', true)
                ->withSum(['stock as on_hand' => fn ($s) => $s->where('branch_id', $branch)], 'quantity'),
        ])
            ->where('is_active', true)
            ->when($r->query('category_id'), fn ($q, $c) => $q->where('category_id', $c))
            ->when($search !== '', fn ($q) => $q->where(fn ($w) => $w->where('name', 'like', "%$search%")
                ->orWhere('brand', 'like', "%$search%")
                ->orWhereHas('variants', fn ($v) => $v->where('sku', 'like', "%$search%")->orWhere('barcode', $search))))
            ->orderBy('name')->get();

        $products->each(function ($p) use ($u) {
            $p->variants->each(function ($v) use ($u) {
                $v->on_hand = (int) $v->on_hand;
                if ($u->role === 'sales') $v->makeHidden('cost_price'); // Sales never see puhunan
            });
        });
        return $products;
    }

    public function show(Request $r, Product $product)
    {
        $product->load(['category', 'variants']);
        if ($r->user()->role === 'sales') {
            $product->variants->each(fn ($variant) => $variant->makeHidden('cost_price'));
        }
        return $product;
    }

    private function rules(bool $create): array
    {
        $s = $create ? 'required' : 'sometimes';
        return [
            'category_id' => "$s|exists:product_categories,id",
            'name' => "$s|string|max:150",
            'brand' => 'nullable|string|max:80',
            'description' => 'nullable|string',
            'tracks_expiry' => 'nullable|boolean',          // null = follow the category
            'shelf_life_months' => 'nullable|integer|min:1|max:240',
            'is_active' => 'sometimes|boolean',
            'variants' => ($create ? 'required' : 'sometimes') . '|array|min:1',
            'variants.*.id' => 'nullable|integer',
            'variants.*.sku' => 'required|string|max:50|distinct',
            'variants.*.barcode' => 'nullable|string|max:50',
            'variants.*.label' => 'nullable|string|max:100',
            'variants.*.attributes' => 'nullable|array',
            'variants.*.cost_price' => 'required|numeric|min:0',
            'variants.*.base_price' => 'required|numeric|min:0',
            'variants.*.selling_price' => 'required|numeric|min:0',
            'variants.*.low_stock_threshold' => 'nullable|integer|min:0',
            'variants.*.is_active' => 'sometimes|boolean',
        ];
    }

    /** @param array<int,array> $variants */
    private function saveVariants(Product $p, array $variants): void
    {
        $category = $p->category ?? ProductCategory::find($p->category_id);
        foreach ($variants as $v) {
            if ($v['base_price'] > $v['selling_price']) {
                throw new ApiException("Variant {$v['sku']}: base price cannot be higher than the selling price", 422);
            }
            if ($category->has_variants && count($variants) > 1 && empty($v['label']) && empty($v['attributes'])) {
                throw new ApiException("Variant {$v['sku']} needs a label or attributes (e.g. size, color)", 422);
            }
            if (empty($v['label']) && !empty($v['attributes'])) {
                $v['label'] = implode(' / ', array_values($v['attributes']));
            }
            $row = ['product_id' => $p->id, 'sku' => $v['sku'], 'barcode' => $v['barcode'] ?? null, 'label' => $v['label'] ?? null,
                'attributes' => $v['attributes'] ?? null, 'cost_price' => $v['cost_price'], 'base_price' => $v['base_price'],
                'selling_price' => $v['selling_price'], 'low_stock_threshold' => $v['low_stock_threshold'] ?? 5,
                'is_active' => $v['is_active'] ?? true];
            if (!empty($v['id'])) {
                ProductVariant::where('product_id', $p->id)->where('id', $v['id'])->firstOrFail()->update($row);
            } else {
                ProductVariant::create($row);
            }
        }
    }

    public function store(Request $r)
    {
        $d = $r->validate($this->rules(true));
        $product = DB::transaction(function () use ($d) {
            $p = Product::create(collect($d)->except('variants')->all());
            $this->saveVariants($p, $d['variants']);
            return $p;
        });
        AuditService::log($r->user(), 'PRODUCT_CREATED', 'product', $product->id, null, $product->toArray());
        return response()->json($product->load(['category', 'variants']), 201);
    }

    public function update(Request $r, Product $product)
    {
        $d = $r->validate($this->rules(false));
        $old = $product->load('variants')->toArray();
        DB::transaction(function () use ($product, $d) {
            $product->update(collect($d)->except('variants')->all());
            if (!empty($d['variants'])) $this->saveVariants($product, $d['variants']);
        });
        AuditService::log($r->user(), 'PRODUCT_UPDATED', 'product', $product->id, $old, $product->fresh('variants')->toArray());
        return $product->fresh(['category', 'variants']);
    }
}
