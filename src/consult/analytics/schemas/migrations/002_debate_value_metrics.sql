-- Add debate value metrics to consultations table
ALTER TABLE consultations ADD COLUMN agents_changed_position INTEGER;
ALTER TABLE consultations ADD COLUMN total_agents INTEGER;
ALTER TABLE consultations ADD COLUMN change_rate REAL;
ALTER TABLE consultations ADD COLUMN avg_confidence_increase REAL;
ALTER TABLE consultations ADD COLUMN convergence_score REAL;
ALTER TABLE consultations ADD COLUMN semantic_comparison_cost REAL;
