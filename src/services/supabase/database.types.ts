export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      ai_scan_items: {
        Row: {
          confidence: number;
          estimated_grams: number;
          id: string;
          label: string;
          match_score: number | null;
          matched_food_id: string | null;
          normalized_query: string;
          portion_basis: string | null;
          preparation: string | null;
          scan_id: string;
          sort_order: number;
          user_accepted: boolean | null;
          user_food_id: string | null;
          user_grams: number | null;
          user_id: string;
        };
        Insert: {
          confidence: number;
          estimated_grams: number;
          id?: string;
          label: string;
          match_score?: number | null;
          matched_food_id?: string | null;
          normalized_query: string;
          portion_basis?: string | null;
          preparation?: string | null;
          scan_id: string;
          sort_order?: number;
          user_accepted?: boolean | null;
          user_food_id?: string | null;
          user_grams?: number | null;
          user_id?: string;
        };
        Update: {
          confidence?: number;
          estimated_grams?: number;
          id?: string;
          label?: string;
          match_score?: number | null;
          matched_food_id?: string | null;
          normalized_query?: string;
          portion_basis?: string | null;
          preparation?: string | null;
          scan_id?: string;
          sort_order?: number;
          user_accepted?: boolean | null;
          user_food_id?: string | null;
          user_grams?: number | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'ai_scan_items_matched_food_id_fkey';
            columns: ['matched_food_id'];
            isOneToOne: false;
            referencedRelation: 'foods';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'ai_scan_items_scan_id_fkey';
            columns: ['scan_id'];
            isOneToOne: false;
            referencedRelation: 'ai_scans';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'ai_scan_items_user_food_id_fkey';
            columns: ['user_food_id'];
            isOneToOne: false;
            referencedRelation: 'foods';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'ai_scan_items_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      ai_scans: {
        Row: {
          cost_usd: number | null;
          created_at: string;
          error_code: string | null;
          expires_at: string;
          id: string;
          image_hash: string | null;
          image_path: string;
          input_tokens: number | null;
          is_food: boolean | null;
          latency_ms: number | null;
          meal_id: string | null;
          model: string | null;
          output_tokens: number | null;
          prompt_version: string | null;
          provider: string | null;
          status: Database['public']['Enums']['scan_status'];
          user_id: string;
        };
        Insert: {
          cost_usd?: number | null;
          created_at?: string;
          error_code?: string | null;
          expires_at?: string;
          id?: string;
          image_hash?: string | null;
          image_path: string;
          input_tokens?: number | null;
          is_food?: boolean | null;
          latency_ms?: number | null;
          meal_id?: string | null;
          model?: string | null;
          output_tokens?: number | null;
          prompt_version?: string | null;
          provider?: string | null;
          status?: Database['public']['Enums']['scan_status'];
          user_id?: string;
        };
        Update: {
          cost_usd?: number | null;
          created_at?: string;
          error_code?: string | null;
          expires_at?: string;
          id?: string;
          image_hash?: string | null;
          image_path?: string;
          input_tokens?: number | null;
          is_food?: boolean | null;
          latency_ms?: number | null;
          meal_id?: string | null;
          model?: string | null;
          output_tokens?: number | null;
          prompt_version?: string | null;
          provider?: string | null;
          status?: Database['public']['Enums']['scan_status'];
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'ai_scans_meal_id_fkey';
            columns: ['meal_id'];
            isOneToOne: false;
            referencedRelation: 'meals';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'ai_scans_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      ai_usage: {
        Row: {
          cost_usd: number;
          count: number;
          feature: string;
          usage_date: string;
          user_id: string;
        };
        Insert: {
          cost_usd?: number;
          count?: number;
          feature: string;
          usage_date: string;
          user_id: string;
        };
        Update: {
          cost_usd?: number;
          count?: number;
          feature?: string;
          usage_date?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'ai_usage_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      allergens: {
        Row: {
          code: string;
          id: number;
        };
        Insert: {
          code: string;
          id: number;
        };
        Update: {
          code?: string;
          id?: number;
        };
        Relationships: [];
      };
      body_measurements: {
        Row: {
          id: string;
          logged_on: string;
          site: string;
          user_id: string;
          value_cm: number;
        };
        Insert: {
          id?: string;
          logged_on: string;
          site: string;
          user_id?: string;
          value_cm: number;
        };
        Update: {
          id?: string;
          logged_on?: string;
          site?: string;
          user_id?: string;
          value_cm?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'body_measurements_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      consents: {
        Row: {
          granted: boolean;
          granted_at: string;
          id: string;
          kind: Database['public']['Enums']['consent_kind'];
          revoked_at: string | null;
          user_id: string;
          version: string;
        };
        Insert: {
          granted: boolean;
          granted_at?: string;
          id?: string;
          kind: Database['public']['Enums']['consent_kind'];
          revoked_at?: string | null;
          user_id?: string;
          version: string;
        };
        Update: {
          granted?: boolean;
          granted_at?: string;
          id?: string;
          kind?: Database['public']['Enums']['consent_kind'];
          revoked_at?: string | null;
          user_id?: string;
          version?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'consents_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      daily_logs: {
        Row: {
          local_date: string;
          mood: number | null;
          note: string | null;
          updated_at: string;
          user_id: string;
          water_ml: number;
        };
        Insert: {
          local_date: string;
          mood?: number | null;
          note?: string | null;
          updated_at?: string;
          user_id?: string;
          water_ml?: number;
        };
        Update: {
          local_date?: string;
          mood?: number | null;
          note?: string | null;
          updated_at?: string;
          user_id?: string;
          water_ml?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'daily_logs_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      deletion_requests: {
        Row: {
          completed_at: string | null;
          id: string;
          requested_at: string;
          status: string;
          user_id: string;
        };
        Insert: {
          completed_at?: string | null;
          id?: string;
          requested_at?: string;
          status?: string;
          user_id?: string;
        };
        Update: {
          completed_at?: string | null;
          id?: string;
          requested_at?: string;
          status?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'deletion_requests_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      exercise_translations: {
        Row: {
          exercise_id: string;
          instructions: string | null;
          locale: string;
          name: string;
        };
        Insert: {
          exercise_id: string;
          instructions?: string | null;
          locale: string;
          name: string;
        };
        Update: {
          exercise_id?: string;
          instructions?: string | null;
          locale?: string;
          name?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'exercise_translations_exercise_id_fkey';
            columns: ['exercise_id'];
            isOneToOne: false;
            referencedRelation: 'exercises';
            referencedColumns: ['id'];
          },
        ];
      };
      exercises: {
        Row: {
          created_at: string;
          created_by: string | null;
          difficulty: number;
          equipment: string;
          id: string;
          instructions: string | null;
          is_public: boolean;
          name: string;
          primary_muscle: string;
          secondary_muscles: string[];
          slug: string;
          video_url: string | null;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          difficulty?: number;
          equipment?: string;
          id?: string;
          instructions?: string | null;
          is_public?: boolean;
          name: string;
          primary_muscle: string;
          secondary_muscles?: string[];
          slug: string;
          video_url?: string | null;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          difficulty?: number;
          equipment?: string;
          id?: string;
          instructions?: string | null;
          is_public?: boolean;
          name?: string;
          primary_muscle?: string;
          secondary_muscles?: string[];
          slug?: string;
          video_url?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'exercises_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      export_requests: {
        Row: {
          expires_at: string | null;
          file_path: string | null;
          id: string;
          requested_at: string;
          status: string;
          user_id: string;
        };
        Insert: {
          expires_at?: string | null;
          file_path?: string | null;
          id?: string;
          requested_at?: string;
          status?: string;
          user_id?: string;
        };
        Update: {
          expires_at?: string | null;
          file_path?: string | null;
          id?: string;
          requested_at?: string;
          status?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'export_requests_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      favorite_foods: {
        Row: {
          created_at: string;
          food_id: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          food_id: string;
          user_id?: string;
        };
        Update: {
          created_at?: string;
          food_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'favorite_foods_food_id_fkey';
            columns: ['food_id'];
            isOneToOne: false;
            referencedRelation: 'foods';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'favorite_foods_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      food_aliases: {
        Row: {
          alias: string;
          food_id: string;
          id: string;
          locale: string;
        };
        Insert: {
          alias: string;
          food_id: string;
          id?: string;
          locale?: string;
        };
        Update: {
          alias?: string;
          food_id?: string;
          id?: string;
          locale?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'food_aliases_food_id_fkey';
            columns: ['food_id'];
            isOneToOne: false;
            referencedRelation: 'foods';
            referencedColumns: ['id'];
          },
        ];
      };
      food_allergens: {
        Row: {
          allergen_id: number;
          food_id: string;
        };
        Insert: {
          allergen_id: number;
          food_id: string;
        };
        Update: {
          allergen_id?: number;
          food_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'food_allergens_allergen_id_fkey';
            columns: ['allergen_id'];
            isOneToOne: false;
            referencedRelation: 'allergens';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'food_allergens_food_id_fkey';
            columns: ['food_id'];
            isOneToOne: false;
            referencedRelation: 'foods';
            referencedColumns: ['id'];
          },
        ];
      };
      food_categories: {
        Row: {
          id: string;
          parent_id: string | null;
          slug: string;
        };
        Insert: {
          id?: string;
          parent_id?: string | null;
          slug: string;
        };
        Update: {
          id?: string;
          parent_id?: string | null;
          slug?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'food_categories_parent_id_fkey';
            columns: ['parent_id'];
            isOneToOne: false;
            referencedRelation: 'food_categories';
            referencedColumns: ['id'];
          },
        ];
      };
      food_nutrients: {
        Row: {
          amount_100g: number;
          food_id: string;
          nutrient_id: number;
        };
        Insert: {
          amount_100g: number;
          food_id: string;
          nutrient_id: number;
        };
        Update: {
          amount_100g?: number;
          food_id?: string;
          nutrient_id?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'food_nutrients_food_id_fkey';
            columns: ['food_id'];
            isOneToOne: false;
            referencedRelation: 'foods';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'food_nutrients_nutrient_id_fkey';
            columns: ['nutrient_id'];
            isOneToOne: false;
            referencedRelation: 'nutrients';
            referencedColumns: ['id'];
          },
        ];
      };
      food_servings: {
        Row: {
          food_id: string;
          grams: number;
          id: string;
          is_default: boolean;
          label: string;
        };
        Insert: {
          food_id: string;
          grams: number;
          id?: string;
          is_default?: boolean;
          label: string;
        };
        Update: {
          food_id?: string;
          grams?: number;
          id?: string;
          is_default?: boolean;
          label?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'food_servings_food_id_fkey';
            columns: ['food_id'];
            isOneToOne: false;
            referencedRelation: 'foods';
            referencedColumns: ['id'];
          },
        ];
      };
      food_translations: {
        Row: {
          food_id: string;
          locale: string;
          name: string;
        };
        Insert: {
          food_id: string;
          locale: string;
          name: string;
        };
        Update: {
          food_id?: string;
          locale?: string;
          name?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'food_translations_food_id_fkey';
            columns: ['food_id'];
            isOneToOne: false;
            referencedRelation: 'foods';
            referencedColumns: ['id'];
          },
        ];
      };
      foods: {
        Row: {
          archived_at: string | null;
          barcode: string | null;
          brand: string | null;
          carbs_100g: number;
          category_id: string | null;
          created_at: string;
          created_by: string | null;
          data_quality: number;
          density_g_ml: number | null;
          fat_100g: number;
          fetched_at: string | null;
          fiber_100g: number | null;
          id: string;
          is_public: boolean;
          kcal_100g: number;
          name: string;
          protein_100g: number;
          sat_fat_100g: number | null;
          search_vector: unknown;
          sodium_mg_100g: number | null;
          source: Database['public']['Enums']['food_source'];
          source_id: string | null;
          sugar_100g: number | null;
          updated_at: string;
          verified_at: string | null;
        };
        Insert: {
          archived_at?: string | null;
          barcode?: string | null;
          brand?: string | null;
          carbs_100g?: number;
          category_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          data_quality?: number;
          density_g_ml?: number | null;
          fat_100g?: number;
          fetched_at?: string | null;
          fiber_100g?: number | null;
          id?: string;
          is_public?: boolean;
          kcal_100g: number;
          name: string;
          protein_100g?: number;
          sat_fat_100g?: number | null;
          search_vector?: unknown;
          sodium_mg_100g?: number | null;
          source: Database['public']['Enums']['food_source'];
          source_id?: string | null;
          sugar_100g?: number | null;
          updated_at?: string;
          verified_at?: string | null;
        };
        Update: {
          archived_at?: string | null;
          barcode?: string | null;
          brand?: string | null;
          carbs_100g?: number;
          category_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          data_quality?: number;
          density_g_ml?: number | null;
          fat_100g?: number;
          fetched_at?: string | null;
          fiber_100g?: number | null;
          id?: string;
          is_public?: boolean;
          kcal_100g?: number;
          name?: string;
          protein_100g?: number;
          sat_fat_100g?: number | null;
          search_vector?: unknown;
          sodium_mg_100g?: number | null;
          source?: Database['public']['Enums']['food_source'];
          source_id?: string | null;
          sugar_100g?: number | null;
          updated_at?: string;
          verified_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'foods_category_id_fkey';
            columns: ['category_id'];
            isOneToOne: false;
            referencedRelation: 'food_categories';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'foods_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      goals: {
        Row: {
          activity: Database['public']['Enums']['activity_level'];
          calorie_target: number;
          carbs_g: number;
          computed_by: string;
          created_at: string;
          effective_from: string;
          fat_g: number;
          fiber_g: number | null;
          goal: Database['public']['Enums']['goal_type'];
          id: string;
          is_active: boolean;
          protein_g: number;
          start_weight_kg: number;
          target_weight_kg: number | null;
          user_id: string;
          water_ml: number | null;
          weekly_rate_kg: number | null;
        };
        Insert: {
          activity: Database['public']['Enums']['activity_level'];
          calorie_target: number;
          carbs_g: number;
          computed_by: string;
          created_at?: string;
          effective_from?: string;
          fat_g: number;
          fiber_g?: number | null;
          goal: Database['public']['Enums']['goal_type'];
          id?: string;
          is_active?: boolean;
          protein_g: number;
          start_weight_kg: number;
          target_weight_kg?: number | null;
          user_id: string;
          water_ml?: number | null;
          weekly_rate_kg?: number | null;
        };
        Update: {
          activity?: Database['public']['Enums']['activity_level'];
          calorie_target?: number;
          carbs_g?: number;
          computed_by?: string;
          created_at?: string;
          effective_from?: string;
          fat_g?: number;
          fiber_g?: number | null;
          goal?: Database['public']['Enums']['goal_type'];
          id?: string;
          is_active?: boolean;
          protein_g?: number;
          start_weight_kg?: number;
          target_weight_kg?: number | null;
          user_id?: string;
          water_ml?: number | null;
          weekly_rate_kg?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'goals_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      meal_items: {
        Row: {
          ai_scan_item_id: string | null;
          carbs_g: number;
          created_at: string;
          custom_name: string | null;
          fat_g: number;
          fiber_g: number | null;
          food_id: string | null;
          id: string;
          kcal: number;
          meal_id: string;
          protein_g: number;
          quantity_g: number;
          recipe_id: string | null;
          serving_id: string | null;
          serving_qty: number | null;
          source: Database['public']['Enums']['entry_source'];
          user_id: string;
        };
        Insert: {
          ai_scan_item_id?: string | null;
          carbs_g?: number;
          created_at?: string;
          custom_name?: string | null;
          fat_g?: number;
          fiber_g?: number | null;
          food_id?: string | null;
          id?: string;
          kcal: number;
          meal_id: string;
          protein_g?: number;
          quantity_g: number;
          recipe_id?: string | null;
          serving_id?: string | null;
          serving_qty?: number | null;
          source: Database['public']['Enums']['entry_source'];
          user_id?: string;
        };
        Update: {
          ai_scan_item_id?: string | null;
          carbs_g?: number;
          created_at?: string;
          custom_name?: string | null;
          fat_g?: number;
          fiber_g?: number | null;
          food_id?: string | null;
          id?: string;
          kcal?: number;
          meal_id?: string;
          protein_g?: number;
          quantity_g?: number;
          recipe_id?: string | null;
          serving_id?: string | null;
          serving_qty?: number | null;
          source?: Database['public']['Enums']['entry_source'];
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'meal_items_ai_scan_item_id_fkey';
            columns: ['ai_scan_item_id'];
            isOneToOne: false;
            referencedRelation: 'ai_scan_items';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'meal_items_food_id_fkey';
            columns: ['food_id'];
            isOneToOne: false;
            referencedRelation: 'foods';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'meal_items_meal_id_fkey';
            columns: ['meal_id'];
            isOneToOne: false;
            referencedRelation: 'meals';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'meal_items_recipe_id_fkey';
            columns: ['recipe_id'];
            isOneToOne: false;
            referencedRelation: 'recipe_nutrition';
            referencedColumns: ['recipe_id'];
          },
          {
            foreignKeyName: 'meal_items_recipe_id_fkey';
            columns: ['recipe_id'];
            isOneToOne: false;
            referencedRelation: 'recipes';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'meal_items_serving_id_fkey';
            columns: ['serving_id'];
            isOneToOne: false;
            referencedRelation: 'food_servings';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'meal_items_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      meal_plan_days: {
        Row: {
          day_index: number;
          id: string;
          local_date: string;
          plan_id: string;
        };
        Insert: {
          day_index: number;
          id?: string;
          local_date: string;
          plan_id: string;
        };
        Update: {
          day_index?: number;
          id?: string;
          local_date?: string;
          plan_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'meal_plan_days_plan_id_fkey';
            columns: ['plan_id'];
            isOneToOne: false;
            referencedRelation: 'meal_plans';
            referencedColumns: ['id'];
          },
        ];
      };
      meal_plan_meals: {
        Row: {
          carbs_g: number;
          fat_g: number;
          id: string;
          kcal: number;
          locked: boolean;
          meal_type: Database['public']['Enums']['meal_type'];
          plan_day_id: string;
          protein_g: number;
          recipe_id: string | null;
          servings: number;
          sort_order: number;
        };
        Insert: {
          carbs_g?: number;
          fat_g?: number;
          id?: string;
          kcal: number;
          locked?: boolean;
          meal_type: Database['public']['Enums']['meal_type'];
          plan_day_id: string;
          protein_g?: number;
          recipe_id?: string | null;
          servings?: number;
          sort_order?: number;
        };
        Update: {
          carbs_g?: number;
          fat_g?: number;
          id?: string;
          kcal?: number;
          locked?: boolean;
          meal_type?: Database['public']['Enums']['meal_type'];
          plan_day_id?: string;
          protein_g?: number;
          recipe_id?: string | null;
          servings?: number;
          sort_order?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'meal_plan_meals_plan_day_id_fkey';
            columns: ['plan_day_id'];
            isOneToOne: false;
            referencedRelation: 'meal_plan_days';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'meal_plan_meals_recipe_id_fkey';
            columns: ['recipe_id'];
            isOneToOne: false;
            referencedRelation: 'recipe_nutrition';
            referencedColumns: ['recipe_id'];
          },
          {
            foreignKeyName: 'meal_plan_meals_recipe_id_fkey';
            columns: ['recipe_id'];
            isOneToOne: false;
            referencedRelation: 'recipes';
            referencedColumns: ['id'];
          },
        ];
      };
      meal_plans: {
        Row: {
          created_at: string;
          end_date: string;
          generator_version: string;
          id: string;
          meals_per_day: number;
          name: string;
          start_date: string;
          target_snapshot: Json;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          end_date: string;
          generator_version: string;
          id?: string;
          meals_per_day: number;
          name: string;
          start_date: string;
          target_snapshot: Json;
          user_id?: string;
        };
        Update: {
          created_at?: string;
          end_date?: string;
          generator_version?: string;
          id?: string;
          meals_per_day?: number;
          name?: string;
          start_date?: string;
          target_snapshot?: Json;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'meal_plans_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      meals: {
        Row: {
          created_at: string;
          eaten_at: string | null;
          id: string;
          local_date: string;
          meal_type: Database['public']['Enums']['meal_type'];
          note: string | null;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          eaten_at?: string | null;
          id?: string;
          local_date: string;
          meal_type: Database['public']['Enums']['meal_type'];
          note?: string | null;
          user_id?: string;
        };
        Update: {
          created_at?: string;
          eaten_at?: string | null;
          id?: string;
          local_date?: string;
          meal_type?: Database['public']['Enums']['meal_type'];
          note?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'meals_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      notifications: {
        Row: {
          id: string;
          kind: string;
          payload: Json;
          scheduled_for: string;
          sent_at: string | null;
          user_id: string;
        };
        Insert: {
          id?: string;
          kind: string;
          payload?: Json;
          scheduled_for: string;
          sent_at?: string | null;
          user_id?: string;
        };
        Update: {
          id?: string;
          kind?: string;
          payload?: Json;
          scheduled_for?: string;
          sent_at?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'notifications_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      nutrients: {
        Row: {
          code: string;
          group_id: number | null;
          id: number;
          unit: string;
        };
        Insert: {
          code: string;
          group_id?: number | null;
          id: number;
          unit: string;
        };
        Update: {
          code?: string;
          group_id?: number | null;
          id?: number;
          unit?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          created_at: string;
          date_of_birth: string;
          display_name: string | null;
          height_cm: number;
          id: string;
          locale: string;
          onboarded_at: string | null;
          sex: Database['public']['Enums']['sex_at_birth'];
          timezone: string;
          unit_system: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          date_of_birth: string;
          display_name?: string | null;
          height_cm: number;
          id: string;
          locale?: string;
          onboarded_at?: string | null;
          sex: Database['public']['Enums']['sex_at_birth'];
          timezone?: string;
          unit_system?: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          date_of_birth?: string;
          display_name?: string | null;
          height_cm?: number;
          id?: string;
          locale?: string;
          onboarded_at?: string | null;
          sex?: Database['public']['Enums']['sex_at_birth'];
          timezone?: string;
          unit_system?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      push_tokens: {
        Row: {
          platform: string;
          token: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          platform: string;
          token: string;
          updated_at?: string;
          user_id?: string;
        };
        Update: {
          platform?: string;
          token?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'push_tokens_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      recipe_ingredients: {
        Row: {
          food_id: string;
          id: string;
          note: string | null;
          quantity_g: number;
          recipe_id: string;
          sort_order: number;
        };
        Insert: {
          food_id: string;
          id?: string;
          note?: string | null;
          quantity_g: number;
          recipe_id: string;
          sort_order?: number;
        };
        Update: {
          food_id?: string;
          id?: string;
          note?: string | null;
          quantity_g?: number;
          recipe_id?: string;
          sort_order?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'recipe_ingredients_food_id_fkey';
            columns: ['food_id'];
            isOneToOne: false;
            referencedRelation: 'foods';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'recipe_ingredients_recipe_id_fkey';
            columns: ['recipe_id'];
            isOneToOne: false;
            referencedRelation: 'recipe_nutrition';
            referencedColumns: ['recipe_id'];
          },
          {
            foreignKeyName: 'recipe_ingredients_recipe_id_fkey';
            columns: ['recipe_id'];
            isOneToOne: false;
            referencedRelation: 'recipes';
            referencedColumns: ['id'];
          },
        ];
      };
      recipes: {
        Row: {
          cook_minutes: number | null;
          created_at: string;
          id: string;
          image_path: string | null;
          instructions: string | null;
          is_public: boolean;
          name: string;
          prep_minutes: number | null;
          servings: number;
          updated_at: string;
          user_id: string | null;
        };
        Insert: {
          cook_minutes?: number | null;
          created_at?: string;
          id?: string;
          image_path?: string | null;
          instructions?: string | null;
          is_public?: boolean;
          name: string;
          prep_minutes?: number | null;
          servings: number;
          updated_at?: string;
          user_id?: string | null;
        };
        Update: {
          cook_minutes?: number | null;
          created_at?: string;
          id?: string;
          image_path?: string | null;
          instructions?: string | null;
          is_public?: boolean;
          name?: string;
          prep_minutes?: number | null;
          servings?: number;
          updated_at?: string;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'recipes_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      session_exercises: {
        Row: {
          exercise_id: string;
          id: string;
          session_id: string;
          sort_order: number;
          user_id: string;
        };
        Insert: {
          exercise_id: string;
          id?: string;
          session_id: string;
          sort_order?: number;
          user_id?: string;
        };
        Update: {
          exercise_id?: string;
          id?: string;
          session_id?: string;
          sort_order?: number;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'session_exercises_exercise_id_fkey';
            columns: ['exercise_id'];
            isOneToOne: false;
            referencedRelation: 'exercises';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'session_exercises_session_id_fkey';
            columns: ['session_id'];
            isOneToOne: false;
            referencedRelation: 'workout_sessions';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'session_exercises_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      shopping_list_items: {
        Row: {
          aisle: string | null;
          custom_name: string | null;
          food_id: string | null;
          id: string;
          is_checked: boolean;
          list_id: string;
          quantity_g: number | null;
          unit_hint: string | null;
          user_id: string;
        };
        Insert: {
          aisle?: string | null;
          custom_name?: string | null;
          food_id?: string | null;
          id?: string;
          is_checked?: boolean;
          list_id: string;
          quantity_g?: number | null;
          unit_hint?: string | null;
          user_id?: string;
        };
        Update: {
          aisle?: string | null;
          custom_name?: string | null;
          food_id?: string | null;
          id?: string;
          is_checked?: boolean;
          list_id?: string;
          quantity_g?: number | null;
          unit_hint?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'shopping_list_items_food_id_fkey';
            columns: ['food_id'];
            isOneToOne: false;
            referencedRelation: 'foods';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'shopping_list_items_list_id_fkey';
            columns: ['list_id'];
            isOneToOne: false;
            referencedRelation: 'shopping_lists';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'shopping_list_items_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      shopping_lists: {
        Row: {
          created_at: string;
          id: string;
          name: string;
          plan_id: string | null;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          name?: string;
          plan_id?: string | null;
          user_id?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          plan_id?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'shopping_lists_plan_id_fkey';
            columns: ['plan_id'];
            isOneToOne: false;
            referencedRelation: 'meal_plans';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'shopping_lists_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      subscriptions: {
        Row: {
          current_period_end: string | null;
          is_trial: boolean;
          product_id: string | null;
          rc_app_user_id: string | null;
          status: Database['public']['Enums']['subscription_status'];
          store: string | null;
          tier: Database['public']['Enums']['subscription_tier'];
          updated_at: string;
          user_id: string;
        };
        Insert: {
          current_period_end?: string | null;
          is_trial?: boolean;
          product_id?: string | null;
          rc_app_user_id?: string | null;
          status?: Database['public']['Enums']['subscription_status'];
          store?: string | null;
          tier?: Database['public']['Enums']['subscription_tier'];
          updated_at?: string;
          user_id: string;
        };
        Update: {
          current_period_end?: string | null;
          is_trial?: boolean;
          product_id?: string | null;
          rc_app_user_id?: string | null;
          status?: Database['public']['Enums']['subscription_status'];
          store?: string | null;
          tier?: Database['public']['Enums']['subscription_tier'];
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'subscriptions_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: true;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      user_diet_settings: {
        Row: {
          budget_tier: number | null;
          cuisines: string[];
          diet: string;
          excluded_allergens: number[];
          max_prep_minutes: number | null;
          meals_per_day: number;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          budget_tier?: number | null;
          cuisines?: string[];
          diet?: string;
          excluded_allergens?: number[];
          max_prep_minutes?: number | null;
          meals_per_day?: number;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          budget_tier?: number | null;
          cuisines?: string[];
          diet?: string;
          excluded_allergens?: number[];
          max_prep_minutes?: number | null;
          meals_per_day?: number;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'user_diet_settings_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: true;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      user_food_preferences: {
        Row: {
          food_id: string;
          preference: Database['public']['Enums']['food_preference'];
          user_id: string;
        };
        Insert: {
          food_id: string;
          preference: Database['public']['Enums']['food_preference'];
          user_id?: string;
        };
        Update: {
          food_id?: string;
          preference?: Database['public']['Enums']['food_preference'];
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'user_food_preferences_food_id_fkey';
            columns: ['food_id'];
            isOneToOne: false;
            referencedRelation: 'foods';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'user_food_preferences_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      weight_logs: {
        Row: {
          body_fat_pct: number | null;
          created_at: string;
          id: string;
          logged_on: string;
          source: string;
          user_id: string;
          weight_kg: number;
        };
        Insert: {
          body_fat_pct?: number | null;
          created_at?: string;
          id?: string;
          logged_on: string;
          source?: string;
          user_id?: string;
          weight_kg: number;
        };
        Update: {
          body_fat_pct?: number | null;
          created_at?: string;
          id?: string;
          logged_on?: string;
          source?: string;
          user_id?: string;
          weight_kg?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'weight_logs_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      workout_exercises: {
        Row: {
          exercise_id: string;
          id: string;
          rest_seconds: number | null;
          sort_order: number;
          target_reps: number | null;
          target_sets: number | null;
          target_weight_kg: number | null;
          workout_id: string;
        };
        Insert: {
          exercise_id: string;
          id?: string;
          rest_seconds?: number | null;
          sort_order?: number;
          target_reps?: number | null;
          target_sets?: number | null;
          target_weight_kg?: number | null;
          workout_id: string;
        };
        Update: {
          exercise_id?: string;
          id?: string;
          rest_seconds?: number | null;
          sort_order?: number;
          target_reps?: number | null;
          target_sets?: number | null;
          target_weight_kg?: number | null;
          workout_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'workout_exercises_exercise_id_fkey';
            columns: ['exercise_id'];
            isOneToOne: false;
            referencedRelation: 'exercises';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workout_exercises_workout_id_fkey';
            columns: ['workout_id'];
            isOneToOne: false;
            referencedRelation: 'workouts';
            referencedColumns: ['id'];
          },
        ];
      };
      workout_sessions: {
        Row: {
          duration_seconds: number | null;
          ended_at: string | null;
          id: string;
          name: string;
          note: string | null;
          started_at: string;
          user_id: string;
          workout_id: string | null;
        };
        Insert: {
          duration_seconds?: number | null;
          ended_at?: string | null;
          id?: string;
          name: string;
          note?: string | null;
          started_at?: string;
          user_id?: string;
          workout_id?: string | null;
        };
        Update: {
          duration_seconds?: number | null;
          ended_at?: string | null;
          id?: string;
          name?: string;
          note?: string | null;
          started_at?: string;
          user_id?: string;
          workout_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'workout_sessions_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workout_sessions_workout_id_fkey';
            columns: ['workout_id'];
            isOneToOne: false;
            referencedRelation: 'workouts';
            referencedColumns: ['id'];
          },
        ];
      };
      workout_sets: {
        Row: {
          completed_at: string;
          id: string;
          is_warmup: boolean;
          reps: number | null;
          rpe: number | null;
          session_exercise_id: string;
          set_number: number;
          user_id: string;
          weight_kg: number | null;
        };
        Insert: {
          completed_at?: string;
          id?: string;
          is_warmup?: boolean;
          reps?: number | null;
          rpe?: number | null;
          session_exercise_id: string;
          set_number: number;
          user_id?: string;
          weight_kg?: number | null;
        };
        Update: {
          completed_at?: string;
          id?: string;
          is_warmup?: boolean;
          reps?: number | null;
          rpe?: number | null;
          session_exercise_id?: string;
          set_number?: number;
          user_id?: string;
          weight_kg?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'workout_sets_session_exercise_id_fkey';
            columns: ['session_exercise_id'];
            isOneToOne: false;
            referencedRelation: 'session_exercises';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workout_sets_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      workouts: {
        Row: {
          created_at: string;
          id: string;
          is_template: boolean;
          name: string;
          note: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          is_template?: boolean;
          name: string;
          note?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          is_template?: boolean;
          name?: string;
          note?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'workouts_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: {
      recipe_nutrition: {
        Row: {
          carbs_g_per_serving: number | null;
          carbs_g_total: number | null;
          fat_g_per_serving: number | null;
          fat_g_total: number | null;
          fiber_g_total: number | null;
          kcal_per_serving: number | null;
          kcal_total: number | null;
          protein_g_per_serving: number | null;
          protein_g_total: number | null;
          recipe_id: string | null;
          servings: number | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      search_foods: {
        Args: { p_limit?: number; p_query: string };
        Returns: {
          brand: string;
          carbs_100g: number;
          data_quality: number;
          fat_100g: number;
          fiber_100g: number;
          id: string;
          kcal_100g: number;
          name: string;
          protein_100g: number;
          score: number;
          source: Database['public']['Enums']['food_source'];
        }[];
      };
      set_active_goal: {
        Args: {
          p_activity: Database['public']['Enums']['activity_level'];
          p_calorie_target: number;
          p_carbs_g: number;
          p_computed_by: string;
          p_fat_g: number;
          p_fiber_g?: number;
          p_goal: Database['public']['Enums']['goal_type'];
          p_protein_g: number;
          p_start_weight_kg: number;
          p_target_weight_kg?: number;
          p_water_ml?: number;
          p_weekly_rate_kg?: number;
        };
        Returns: {
          activity: Database['public']['Enums']['activity_level'];
          calorie_target: number;
          carbs_g: number;
          computed_by: string;
          created_at: string;
          effective_from: string;
          fat_g: number;
          fiber_g: number | null;
          goal: Database['public']['Enums']['goal_type'];
          id: string;
          is_active: boolean;
          protein_g: number;
          start_weight_kg: number;
          target_weight_kg: number | null;
          user_id: string;
          water_ml: number | null;
          weekly_rate_kg: number | null;
        };
        SetofOptions: {
          from: '*';
          to: 'goals';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
    };
    Enums: {
      activity_level: 'sedentary' | 'light' | 'moderate' | 'very' | 'extra';
      consent_kind: 'terms' | 'privacy' | 'analytics' | 'ai_photo_processing';
      entry_source: 'search' | 'barcode' | 'ai_scan' | 'manual' | 'recipe' | 'favorite';
      food_preference: 'liked' | 'disliked' | 'excluded';
      food_source: 'usda' | 'off' | 'user' | 'curated';
      goal_type: 'lose' | 'maintain' | 'gain' | 'muscle_gain';
      meal_type: 'breakfast' | 'lunch' | 'dinner' | 'snack';
      scan_status: 'pending' | 'analyzing' | 'matched' | 'confirmed' | 'failed' | 'discarded';
      sex_at_birth: 'male' | 'female';
      subscription_status: 'active' | 'trialing' | 'grace' | 'expired' | 'cancelled';
      subscription_tier: 'free' | 'premium';
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema['Enums'] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema['CompositeTypes'] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      activity_level: ['sedentary', 'light', 'moderate', 'very', 'extra'],
      consent_kind: ['terms', 'privacy', 'analytics', 'ai_photo_processing'],
      entry_source: ['search', 'barcode', 'ai_scan', 'manual', 'recipe', 'favorite'],
      food_preference: ['liked', 'disliked', 'excluded'],
      food_source: ['usda', 'off', 'user', 'curated'],
      goal_type: ['lose', 'maintain', 'gain', 'muscle_gain'],
      meal_type: ['breakfast', 'lunch', 'dinner', 'snack'],
      scan_status: ['pending', 'analyzing', 'matched', 'confirmed', 'failed', 'discarded'],
      sex_at_birth: ['male', 'female'],
      subscription_status: ['active', 'trialing', 'grace', 'expired', 'cancelled'],
      subscription_tier: ['free', 'premium'],
    },
  },
} as const;
