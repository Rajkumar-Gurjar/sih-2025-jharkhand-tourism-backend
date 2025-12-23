/**
 * Booking Model
 *
 * Defines the Booking entity structure using Mongoose ODM.
 * Bookings represent reservations for homestays or guide services.
 */

import mongoose, { Schema, Document, Model, Types } from 'mongoose';

/**
 * Type of listing being booked.
 */
export type ListingType = 'homestay' | 'guide';

/**
 * Booking status lifecycle.
 * - pending: Awaiting confirmation
 * - confirmed: Booking confirmed
 * - cancelled: Booking cancelled
 * - completed: Stay/service completed
 */
export type BookingStatus = 'pending' | 'confirmed' | 'cancelled' | 'completed';

/**
 * Payment status for the booking.
 */
export type PaymentStatus = 'pending' | 'completed' | 'refunded' | 'failed';

/**
 * Guest count breakdown.
 */
export interface GuestCount {
	adults: number;
	children?: number;
	total?: number;
}

/**
 * Guest contact details.
 */
export interface GuestDetails {
	name: string;
	email: string;
	phone: string;
}

/**
 * Booking pricing breakdown.
 */
export interface BookingPricing {
	basePrice: number;
	cleaningFee?: number;
	serviceFee?: number;
	taxes?: number;
	total: number;
}

/**
 * Complete Booking entity interface.
 */
export interface IBooking {
	bookingNumber: string;
	listingType: ListingType;
	listingId: Types.ObjectId | string;
	listingTitle?: string;
	checkIn: Date;
	checkOut: Date;
	nights?: number;
	guests: GuestCount;
	guestDetails: GuestDetails;
	specialRequests?: string;
	pricing: BookingPricing;
	status: BookingStatus;
	paymentStatus: PaymentStatus;
	cancellationReason?: string;
	cancelledAt?: Date;
	createdAt: Date;
	updatedAt: Date;
}

/**
 * Booking document type (includes Mongoose Document properties).
 */
export interface IBookingDocument extends IBooking, Document {}

/**
 * Input type for creating a new booking.
 * Excludes auto-generated fields.
 */
export type CreateBookingInput = {
	listingType: ListingType;
	listingId: string;
	checkIn: string;
	checkOut: string;
	guests: GuestCount;
	guestDetails: GuestDetails;
	specialRequests?: string;
	pricing: BookingPricing;
};

/**
 * Input type for cancelling a booking.
 */
export interface CancelBookingInput {
	reason?: string;
}

// ============================================================================
// Mongoose Schemas
// ============================================================================

/**
 * Guest count subdocument schema.
 */
const guestCountSchema = new Schema({
	adults: { type: Number, required: true, min: 1 },
	children: { type: Number, required: false, default: 0 },
	total: { type: Number, required: false }
}, { _id: false });

/**
 * Guest details subdocument schema.
 */
const guestDetailsSchema = new Schema({
	name: { type: String, required: true, trim: true },
	email: { type: String, required: true, trim: true, lowercase: true },
	phone: { type: String, required: true, trim: true }
}, { _id: false });

/**
 * Pricing subdocument schema.
 */
const pricingSchema = new Schema({
	basePrice: { type: Number, required: true, min: 0 },
	cleaningFee: { type: Number, required: false },
	serviceFee: { type: Number, required: false },
	taxes: { type: Number, required: false },
	total: { type: Number, required: true, min: 0 }
}, { _id: false });

/**
 * Main Booking schema.
 */
const bookingSchema = new Schema<IBookingDocument>({
	bookingNumber: {
		type: String,
		required: true,
		unique: true,
		index: true
	},
	listingType: {
		type: String,
		enum: ['homestay', 'guide'],
		required: true
	},
	listingId: {
		type: Schema.Types.ObjectId,
		required: true,
		refPath: 'listingType' // Dynamic reference based on listingType
	},
	listingTitle: {
		type: String,
		required: false
	},
	checkIn: {
		type: Date,
		required: true
	},
	checkOut: {
		type: Date,
		required: true
	},
	nights: {
		type: Number,
		required: false
	},
	guests: {
		type: guestCountSchema,
		required: true
	},
	guestDetails: {
		type: guestDetailsSchema,
		required: true
	},
	specialRequests: {
		type: String,
		required: false
	},
	pricing: {
		type: pricingSchema,
		required: true
	},
	status: {
		type: String,
		enum: ['pending', 'confirmed', 'cancelled', 'completed'],
		default: 'pending'
	},
	paymentStatus: {
		type: String,
		enum: ['pending', 'completed', 'refunded', 'failed'],
		default: 'pending'
	},
	cancellationReason: {
		type: String,
		required: false
	},
	cancelledAt: {
		type: Date,
		required: false
	}
}, {
	timestamps: true,
	collection: 'bookings'
});

// ============================================================================
// Indexes
// ============================================================================

bookingSchema.index({ listingId: 1, checkIn: 1, checkOut: 1 });
bookingSchema.index({ status: 1 });
bookingSchema.index({ 'guestDetails.email': 1 });
bookingSchema.index({ createdAt: -1 }); // For sorting by newest first

// ============================================================================
// Pre-save Middleware
// ============================================================================

/**
 * Calculate nights and total guests before saving.
 */
bookingSchema.pre('save', function() {
	// Calculate nights if not set
	if (!this.nights && this.checkIn && this.checkOut) {
		const diffTime = this.checkOut.getTime() - this.checkIn.getTime();
		this.nights = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
	}

	// Calculate total guests if not set
	if (this.guests && !this.guests.total) {
		this.guests.total = this.guests.adults + (this.guests.children || 0);
	}
});

// ============================================================================
// Model Export
// ============================================================================

/**
 * Booking Mongoose model.
 */
export const BookingModel: Model<IBookingDocument> = mongoose.model<IBookingDocument>('Booking', bookingSchema);
