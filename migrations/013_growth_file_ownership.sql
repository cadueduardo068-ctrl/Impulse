ALTER TABLE growth_documents ADD CONSTRAINT growth_document_company_id UNIQUE(company_id,id);
ALTER TABLE growth_files DROP CONSTRAINT growth_files_document_id_fkey;
ALTER TABLE growth_files ADD CONSTRAINT growth_file_document_company FOREIGN KEY(company_id,document_id) REFERENCES growth_documents(company_id,id);
