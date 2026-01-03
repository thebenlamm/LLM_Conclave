-- Add project context metadata to consultations table
ALTER TABLE consultations ADD COLUMN project_type TEXT;
ALTER TABLE consultations ADD COLUMN framework_detected TEXT;
ALTER TABLE consultations ADD COLUMN tech_stack TEXT;

CREATE INDEX idx_consultations_project_type ON consultations(project_type);
CREATE INDEX idx_consultations_framework ON consultations(framework_detected);
