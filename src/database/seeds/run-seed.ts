import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import * as crypto from 'crypto';

dotenv.config();

/**
 * Seeds the database with initial data for development.
 * Run with: npm run seed:run
 *
 * This creates:
 * - An owner account (so you can access admin features)
 * - Two sample locations
 * - Sample drink menu items
 * - Default drink limit configs (unlimited)
 */
async function seed() {
  const dataSource = new DataSource({
    type: 'postgres',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    username: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_DATABASE || 'fpk_drinks',
    synchronize: false,
  });

  await dataSource.initialize();
  console.log('Connected to database');

  const queryRunner = dataSource.createQueryRunner();

  try {
    // ===== CREATE OWNER ACCOUNT =====
    // Note: You'll need to update the firebase_uid after signing in with Firebase
    const ownerId = crypto.randomUUID();
    await queryRunner.query(`
      INSERT INTO users (id, email, full_name, date_of_birth, firebase_uid, role, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (email) DO NOTHING
    `, [
      ownerId,
      'owner@funpizzakitchen.com',
      'FPK Owner',
      '1990-01-01',
      'REPLACE_WITH_YOUR_FIREBASE_UID',
      'owner',
      'verified',
    ]);
    console.log('Owner account created (update firebase_uid after first Firebase sign-in)');

    // ===== CREATE LOCATIONS =====
    const loc1Id = crypto.randomUUID();
    const loc2Id = crypto.randomUUID();

    await queryRunner.query(`
      INSERT INTO locations (id, name, address, city, state, zip) VALUES
      ($1, 'Fun Pizza Kitchen - Downtown', '123 Main Street', 'Arlington', 'TX', '76010'),
      ($2, 'Fun Pizza Kitchen - Westside', '456 Oak Avenue', 'Arlington', 'TX', '76013')
      ON CONFLICT DO NOTHING
    `, [loc1Id, loc2Id]);
    console.log('Sample locations created');

    // ===== CREATE DRINK MENU ITEMS =====
    const drinks = [
      { name: 'Bud Light', category: 'american_beer' },
      { name: 'Budweiser', category: 'american_beer' },
      { name: 'Coors Light', category: 'american_beer' },
      { name: 'Miller Lite', category: 'american_beer' },
      { name: 'Michelob Ultra', category: 'american_beer' },
      { name: 'Blue Moon', category: 'draft_beer' },
      { name: 'Shiner Bock', category: 'draft_beer' },
      { name: 'Dos Equis Lager', category: 'draft_beer' },
      { name: 'Stella Artois', category: 'draft_beer' },
      { name: 'Sam Adams Boston Lager', category: 'draft_beer' },
    ];

    for (const drink of drinks) {
      const drinkId = crypto.randomUUID();
      await queryRunner.query(`
        INSERT INTO drink_menu_items (id, name, category)
        VALUES ($1, $2, $3)
        ON CONFLICT DO NOTHING
      `, [drinkId, drink.name, drink.category]);

      // Make available at both locations
      await queryRunner.query(`
        INSERT INTO location_drinks (id, location_id, drink_item_id, is_available)
        VALUES ($1, $2, $3, true), ($4, $5, $3, true)
        ON CONFLICT DO NOTHING
      `, [crypto.randomUUID(), loc1Id, drinkId, crypto.randomUUID(), loc2Id]);
    }
    console.log('Sample drink menu created (10 items)');

    // ===== CREATE DEFAULT DRINK LIMIT CONFIGS =====
    await queryRunner.query(`
      INSERT INTO drink_limit_configs (id, location_id, max_drinks_per_day, cooldown_minutes, is_unlimited, is_active)
      VALUES ($1, $2, 0, 0, true, true), ($3, $4, 0, 0, true, true)
      ON CONFLICT (location_id) DO NOTHING
    `, [crypto.randomUUID(), loc1Id, crypto.randomUUID(), loc2Id]);
    console.log('Default drink limit configs created (unlimited)');

    // ===== CREATE SAMPLE PROMO CODE =====
    await queryRunner.query(`
      INSERT INTO promo_codes (id, code, discount_type, discount_value, max_uses, is_active)
      VALUES ($1, 'WELCOME20', 'percentage', 20, 100, true)
      ON CONFLICT (code) DO NOTHING
    `, [crypto.randomUUID()]);
    console.log('Sample promo code created: WELCOME20 (20% off)');

    console.log('\n✅ Database seeded successfully!');
    console.log('\n⚠️  IMPORTANT: Update the owner firebase_uid in the users table');
    console.log('   after your first Firebase sign-in.');

  } catch (error) {
    console.error('Seed failed:', error);
  } finally {
    await dataSource.destroy();
  }
}

seed();
