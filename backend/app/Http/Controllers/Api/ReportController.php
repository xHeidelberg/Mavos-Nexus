<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Branch;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Keep APP_TIMEZONE (e.g. Asia/Manila) fixed: Laravel stores timestamps in that zone,
 * and day/week/month boundaries below are computed in the same zone.
 */
class ReportController extends Controller
{
    private function params(Request $r): array
    {
        $d = $r->validate(['period' => 'sometimes|in:daily,weekly,monthly,yearly', 'date' => 'sometimes|date_format:Y-m-d', 'branch_id' => 'sometimes|integer']);
        $period = $d['period'] ?? 'daily';
        $day = Carbon::parse($d['date'] ?? now()->toDateString())->startOfDay();
        [$from, $to] = match ($period) {
            'weekly' => [$day->copy()->startOfWeek(), $day->copy()->startOfWeek()->addWeek()],   // Monday start
            'monthly' => [$day->copy()->startOfMonth(), $day->copy()->startOfMonth()->addMonth()],
            'yearly' => [$day->copy()->startOfYear(), $day->copy()->startOfYear()->addYear()],
            default => [$day, $day->copy()->addDay()],
        };
        $u = $r->user();
        $branch = $u->role === 'admin' ? ($d['branch_id'] ?? null) : $u->branch_id;
        return [$period, $from, $to, $branch];
    }

    /**
     * End-of-day style summary:
     *   revenue = completed sales + exchange price differences
     *   puhunan = cost of items sold (net of exchange returns)
     *   tubo    = revenue - puhunan - expenses
     */
    public function eod(Request $r)
    {
        [$period, $from, $to, $branch] = $this->params($r);
        $b = fn ($q, $col = 'branch_id') => $q->when($branch, fn ($w) => $w->where($col, $branch));

        $sales = $b(DB::table('sales')->where('status', 'completed')->where('sold_at', '>=', $from)->where('sold_at', '<', $to));
        $revenue = (float) (clone $sales)->sum('total');
        $transactions = (clone $sales)->count();
        $discounts = (float) (clone $sales)->sum('discount_total');

        $cogs = (float) $b(DB::table('sale_items as si')->join('sales as s', 's.id', '=', 'si.sale_id')
            ->where('s.status', 'completed')->where('s.sold_at', '>=', $from)->where('s.sold_at', '<', $to), 's.branch_id')
            ->sum(DB::raw('si.qty * si.unit_cost'));

        $exRev = (float) $b(DB::table('exchanges')->where('created_at', '>=', $from)->where('created_at', '<', $to))->sum('price_difference');
        $exCogs = (float) $b(DB::table('exchange_items as ei')->join('exchanges as e', 'e.id', '=', 'ei.exchange_id')
            ->where('e.created_at', '>=', $from)->where('e.created_at', '<', $to), 'e.branch_id')
            ->sum(DB::raw("CASE ei.direction WHEN 'given' THEN ei.qty * ei.unit_cost ELSE -ei.qty * ei.unit_cost END"));

        $expenses = (float) $b(DB::table('expenses')->where('expense_date', '>=', $from->toDateString())->where('expense_date', '<', $to->toDateString()))->sum('amount');

        $rev = $revenue + $exRev;
        $puhunan = $cogs + $exCogs;
        return [
            'period' => $period, 'from' => $from->toDateString(), 'to_exclusive' => $to->toDateString(), 'branch_id' => $branch,
            'revenue' => round($rev, 2), 'transactions' => $transactions, 'discounts' => round($discounts, 2),
            'puhunan' => round($puhunan, 2), 'expenses' => round($expenses, 2),
            'gross_profit' => round($rev - $puhunan, 2), 'tubo' => round($rev - $puhunan - $expenses, 2),
        ];
    }

    // Per-day totals inside the period (for charts).
    public function series(Request $r)
    {
        [, $from, $to, $branch] = $this->params($r);
        $days = DB::table('sales')->where('status', 'completed')->where('sold_at', '>=', $from)->where('sold_at', '<', $to)
            ->when($branch, fn ($q) => $q->where('branch_id', $branch))
            ->groupBy(DB::raw('DATE(sold_at)'))->orderBy(DB::raw('DATE(sold_at)'))
            ->get([DB::raw('DATE(sold_at) as day'), DB::raw('SUM(total) as revenue'), DB::raw('COUNT(*) as transactions')]);
        return ['from' => $from->toDateString(), 'to_exclusive' => $to->toDateString(), 'days' => $days];
    }

    // Top sales per location and per user.
    public function performance(Request $r)
    {
        [, $from, $to, $branch] = $this->params($r);
        $base = fn () => DB::table('sales as s')->join('branches as b', 'b.id', '=', 's.branch_id')->join('users as u', 'u.id', '=', 's.cashier_id')
            ->where('s.status', 'completed')->where('s.sold_at', '>=', $from)->where('s.sold_at', '<', $to)
            ->when($branch, fn ($q) => $q->where('s.branch_id', $branch));
        return [
            'from' => $from->toDateString(), 'to_exclusive' => $to->toDateString(),
            'by_branch' => $base()->groupBy('b.id', 'b.name')->orderByDesc('total_sales')
                ->get(['b.id as branch_id', 'b.name', DB::raw('SUM(s.total) as total_sales'), DB::raw('COUNT(*) as transactions')]),
            'by_user' => $base()->groupBy('u.id', 'u.full_name', 'b.name')->orderByDesc('total_sales')->limit(50)
                ->get(['u.id as user_id', 'u.full_name', 'b.name as branch', DB::raw('SUM(s.total) as total_sales'), DB::raw('COUNT(*) as transactions')]),
        ];
    }
}
