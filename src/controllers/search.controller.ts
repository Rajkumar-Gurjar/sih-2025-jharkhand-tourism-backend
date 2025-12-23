/**
 * Search Controller
 *
 * Handles unified search and autocomplete functionality across all entities.
 * Uses MongoDB via Mongoose for data persistence.
 */

import { Request, Response } from 'express';
import { HomestayModel } from '../models/homestays/Homestay.model';
import { GuideModel } from '../models/guides/Guide.model';
import { ProductModel } from '../models/products/Product.model';
import {
	sendSuccess,
	sendError,
	getPaginationMeta,
	parsePaginationParams
} from '../utils/response.utils';

/**
 * Search result types for type safety.
 */
type SearchType = 'all' | 'homestays' | 'guides' | 'products';

/**
 * GET /api/search
 *
 * Performs unified search across homestays, guides, and products.
 *
 * Query params:
 * - q: Search query (minimum 2 characters)
 * - type: Filter by type (all, homestays, guides, products)
 * - page: Page number (default: 1)
 * - limit: Items per page (default: 10, max: 100)
 */
export async function unifiedSearch(req: Request, res: Response): Promise<void> {
	try {
		const query = (req.query.q as string || '').trim();
		const type = (req.query.type as SearchType) || 'all';
		const { page, limit } = parsePaginationParams(
			req.query.page as string,
			req.query.limit as string
		);

		// Validate query length
		if (query.length < 2) {
			sendError(res, 'Validation failed', 400, [
				{ field: 'q', message: 'Search query must be at least 2 characters' }
			]);
			return;
		}

		// Create case-insensitive regex for search
		const searchRegex = new RegExp(query, 'i');

		// Search queries in parallel
		const searchPromises: Promise<unknown[]>[] = [];

		// Search homestays
		if (type === 'all' || type === 'homestays') {
			searchPromises.push(
				HomestayModel.find({
					status: 'active',
					$or: [
						{ title: searchRegex },
						{ description: searchRegex },
						{ 'location.district': searchRegex },
						{ 'location.address': searchRegex }
					]
				})
					.select('title description location.district location.state pricing.basePrice images')
					.skip((page - 1) * limit)
					.limit(limit)
					.lean()
					.then(results => results.map(h => ({
						...h,
						type: 'homestay',
						images: h.images?.slice(0, 1) || []
					})))
			);
		} else {
			searchPromises.push(Promise.resolve([]));
		}

		// Search guides
		if (type === 'all' || type === 'guides') {
			searchPromises.push(
				GuideModel.find({
					$or: [
						{ name: searchRegex },
						{ bio: searchRegex },
						{ specializations: searchRegex },
						{ 'location.district': searchRegex }
					]
				})
					.select('name bio specializations pricing.fullDay')
					.skip((page - 1) * limit)
					.limit(limit)
					.lean()
					.then(results => results.map(g => ({
						...g,
						type: 'guide'
					})))
			);
		} else {
			searchPromises.push(Promise.resolve([]));
		}

		// Search products
		if (type === 'all' || type === 'products') {
			searchPromises.push(
				ProductModel.find({
					$or: [
						{ title: searchRegex },
						{ description: searchRegex },
						{ category: searchRegex }
					]
				})
					.select('title description category price.amount images')
					.skip((page - 1) * limit)
					.limit(limit)
					.lean()
					.then(results => results.map(p => ({
						...p,
						type: 'product',
						images: p.images?.slice(0, 1) || []
					})))
			);
		} else {
			searchPromises.push(Promise.resolve([]));
		}

		// Count queries in parallel
		const countPromises: Promise<number>[] = [];

		if (type === 'all' || type === 'homestays') {
			countPromises.push(
				HomestayModel.countDocuments({
					status: 'active',
					$or: [
						{ title: searchRegex },
						{ description: searchRegex },
						{ 'location.district': searchRegex },
						{ 'location.address': searchRegex }
					]
				})
			);
		} else {
			countPromises.push(Promise.resolve(0));
		}

		if (type === 'all' || type === 'guides') {
			countPromises.push(
				GuideModel.countDocuments({
					$or: [
						{ name: searchRegex },
						{ bio: searchRegex },
						{ specializations: searchRegex },
						{ 'location.district': searchRegex }
					]
				})
			);
		} else {
			countPromises.push(Promise.resolve(0));
		}

		if (type === 'all' || type === 'products') {
			countPromises.push(
				ProductModel.countDocuments({
					$or: [
						{ title: searchRegex },
						{ description: searchRegex },
						{ category: searchRegex }
					]
				})
			);
		} else {
			countPromises.push(Promise.resolve(0));
		}

		// Execute all queries
		const [searchResults, counts] = await Promise.all([
			Promise.all(searchPromises),
			Promise.all(countPromises)
		]);

		const [homestays, guides, products] = searchResults as [unknown[], unknown[], unknown[]];
		const [homestaysCount, guidesCount, productsCount] = counts;

		const total = {
			homestays: homestaysCount,
			guides: guidesCount,
			products: productsCount,
			overall: homestaysCount + guidesCount + productsCount
		};

		sendSuccess(res, {
			results: {
				homestays,
				guides,
				products,
				total
			},
			query,
			pagination: getPaginationMeta(page, limit, total.overall)
		});
	} catch (error) {
		console.error('Error in unified search:', error);
		sendError(res, 'Failed to perform search', 500);
	}
}

/**
 * GET /api/search/autocomplete
 *
 * Provides search suggestions for autocomplete.
 *
 * Query params:
 * - q: Search query (minimum 2 characters)
 */
export async function autocomplete(req: Request, res: Response): Promise<void> {
	try {
		const query = (req.query.q as string || '').trim();

		// Validate query length
		if (query.length < 2) {
			sendError(res, 'Validation failed', 400, [
				{ field: 'q', message: 'Search query must be at least 2 characters' }
			]);
			return;
		}

		const searchRegex = new RegExp(query, 'i');

		// Get suggestions in parallel
		const [homestays, guides, products, locations] = await Promise.all([
			// Matching homestay titles
			HomestayModel.find({ status: 'active', title: searchRegex })
				.select('title')
				.limit(3)
				.lean(),

			// Matching guide names
			GuideModel.find({ name: searchRegex })
				.select('name')
				.limit(3)
				.lean(),

			// Matching product titles
			ProductModel.find({ title: searchRegex })
				.select('title')
				.limit(3)
				.lean(),

			// Get unique districts with counts
			HomestayModel.aggregate([
				{ $match: { 'location.district': searchRegex } },
				{ $group: { _id: '$location.district', count: { $sum: 1 } } },
				{ $limit: 3 }
			])
		]);

		const suggestions: Array<{
			text: string;
			type: string;
			id?: string;
			count?: number;
		}> = [];

		// Add location suggestions
		locations.forEach((loc: { _id: string; count: number }) => {
			suggestions.push({ text: loc._id, type: 'location', count: loc.count });
		});

		// Add homestay suggestions
		homestays.forEach(h => {
			suggestions.push({ text: h.title, type: 'homestay', id: String(h._id) });
		});

		// Add guide suggestions
		guides.forEach(g => {
			suggestions.push({ text: g.name, type: 'guide', id: String(g._id) });
		});

		// Add product suggestions
		products.forEach(p => {
			suggestions.push({ text: p.title, type: 'product', id: String(p._id) });
		});

		sendSuccess(res, {
			suggestions: suggestions.slice(0, 10)
		});
	} catch (error) {
		console.error('Error in autocomplete:', error);
		sendError(res, 'Failed to get suggestions', 500);
	}
}
