-- Carga inicial de clientes y prestamos desde Excel.
-- Ejecutar en Supabase SQL Editor.
-- Reemplaza los datos operativos actuales de loan_app_state.
-- No borra usuarios de Supabase Auth ni roles de public.profiles.

update public.loan_app_state
set
  data = jsonb_build_object(
    'clients', jsonb_build_array(
      jsonb_build_object('id','CLI-00000001','docType','DNI','docNumber','00000001','name','Deysi','phone','','email','','address','','status','Activo','registeredAt','2026-06-02','createdAt',now(),'updatedAt',now()),
      jsonb_build_object('id','CLI-00000002','docType','DNI','docNumber','00000002','name','Johana','phone','','email','','address','','status','Activo','registeredAt','2026-06-05','createdAt',now(),'updatedAt',now()),
      jsonb_build_object('id','CLI-00000003','docType','DNI','docNumber','00000003','name','Roxana','phone','','email','','address','','status','Activo','registeredAt','2026-06-06','createdAt',now(),'updatedAt',now()),
      jsonb_build_object('id','CLI-00000004','docType','DNI','docNumber','00000004','name','Ralf','phone','','email','','address','','status','Activo','registeredAt','2026-06-06','createdAt',now(),'updatedAt',now()),
      jsonb_build_object('id','CLI-00000005','docType','DNI','docNumber','00000005','name','Mama Deysi','phone','','email','','address','','status','Activo','registeredAt','2026-06-07','createdAt',now(),'updatedAt',now()),
      jsonb_build_object('id','CLI-00000006','docType','DNI','docNumber','00000006','name','Karlita','phone','','email','','address','','status','Activo','registeredAt','2026-06-08','createdAt',now(),'updatedAt',now()),
      jsonb_build_object('id','CLI-00000007','docType','DNI','docNumber','00000007','name','Sra. Maria','phone','','email','','address','','status','Activo','registeredAt','2026-06-10','createdAt',now(),'updatedAt',now()),
      jsonb_build_object('id','CLI-00000008','docType','DNI','docNumber','00000008','name','Patty','phone','','email','','address','','status','Activo','registeredAt','2026-06-21','createdAt',now(),'updatedAt',now()),
      jsonb_build_object('id','CLI-00000009','docType','DNI','docNumber','00000009','name','Lula','phone','','email','','address','','status','Activo','registeredAt','2026-06-20','createdAt',now(),'updatedAt',now()),
      jsonb_build_object('id','CLI-00000010','docType','DNI','docNumber','00000010','name','Erika','phone','','email','','address','','status','Activo','registeredAt','2026-06-21','createdAt',now(),'updatedAt',now()),
      jsonb_build_object('id','CLI-00000012','docType','DNI','docNumber','00000012','name','Mariela','phone','','email','','address','','status','Activo','registeredAt','2026-06-30','createdAt',now(),'updatedAt',now()),
      jsonb_build_object('id','CLI-00000013','docType','DNI','docNumber','00000013','name','Analy','phone','','email','','address','','status','Activo','registeredAt','2026-06-28','createdAt',now(),'updatedAt',now())
    ),
    'loans', jsonb_build_array(
      jsonb_build_object('id','PRE-00000001','code','00000001','clientId','CLI-00000001','disbursementDate','2026-06-02','principal',3000,'currency','PEN','interestRate',10,'interestType','Interes porcentual mensual','mode','Pago mensual','hasSchedule',false,'termDays',30,'estimatedPayDate','2026-07-02','firstPayDate','2026-07-02','installments',0,'status','Vigente','note','Importado desde Excel','createdAt',now(),'updatedAt',now()),
      jsonb_build_object('id','PRE-00000002','code','00000002','clientId','CLI-00000002','disbursementDate','2026-06-05','principal',1000,'currency','PEN','interestRate',10,'interestType','Interes porcentual mensual','mode','Pago mensual','hasSchedule',false,'termDays',30,'estimatedPayDate','2026-07-05','firstPayDate','2026-07-05','installments',0,'status','Vigente','note','Importado desde Excel','createdAt',now(),'updatedAt',now()),
      jsonb_build_object('id','PRE-00000003','code','00000003','clientId','CLI-00000003','disbursementDate','2026-06-06','principal',1500,'currency','PEN','interestRate',10,'interestType','Interes porcentual mensual','mode','Pago mensual','hasSchedule',false,'termDays',30,'estimatedPayDate','2026-07-06','firstPayDate','2026-07-06','installments',0,'status','Vigente','note','Importado desde Excel','createdAt',now(),'updatedAt',now()),
      jsonb_build_object('id','PRE-00000004','code','00000004','clientId','CLI-00000004','disbursementDate','2026-06-06','principal',3500,'currency','PEN','interestRate',10,'interestType','Interes porcentual mensual','mode','Pago mensual','hasSchedule',false,'termDays',30,'estimatedPayDate','2026-07-06','firstPayDate','2026-07-06','installments',0,'status','Vigente','note','Importado desde Excel','createdAt',now(),'updatedAt',now()),
      jsonb_build_object('id','PRE-00000005','code','00000005','clientId','CLI-00000005','disbursementDate','2026-06-07','principal',1500,'currency','PEN','interestRate',10,'interestType','Interes porcentual mensual','mode','Pago mensual','hasSchedule',false,'termDays',30,'estimatedPayDate','2026-07-07','firstPayDate','2026-07-07','installments',0,'status','Vigente','note','Importado desde Excel','createdAt',now(),'updatedAt',now()),
      jsonb_build_object('id','PRE-00000006','code','00000006','clientId','CLI-00000006','disbursementDate','2026-06-08','principal',300,'currency','PEN','interestRate',10,'interestType','Interes porcentual mensual','mode','Pago mensual','hasSchedule',false,'termDays',30,'estimatedPayDate','2026-07-08','firstPayDate','2026-07-08','installments',0,'status','Vigente','note','Importado desde Excel','createdAt',now(),'updatedAt',now()),
      jsonb_build_object('id','PRE-00000007','code','00000007','clientId','CLI-00000007','disbursementDate','2026-06-10','principal',500,'currency','PEN','interestRate',10,'interestType','Interes porcentual mensual','mode','Pago mensual','hasSchedule',false,'termDays',30,'estimatedPayDate','2026-07-10','firstPayDate','2026-07-10','installments',0,'status','Vigente','note','Importado desde Excel','createdAt',now(),'updatedAt',now()),
      jsonb_build_object('id','PRE-00000008','code','00000008','clientId','CLI-00000008','disbursementDate','2026-06-21','principal',300,'currency','PEN','interestRate',10,'interestType','Interes porcentual mensual','mode','Pago mensual','hasSchedule',false,'termDays',30,'estimatedPayDate','2026-07-21','firstPayDate','2026-07-21','installments',0,'status','Vigente','note','Importado desde Excel','createdAt',now(),'updatedAt',now()),
      jsonb_build_object('id','PRE-00000009','code','00000009','clientId','CLI-00000009','disbursementDate','2026-06-20','principal',500,'currency','PEN','interestRate',10,'interestType','Interes porcentual mensual','mode','Pago mensual','hasSchedule',false,'termDays',30,'estimatedPayDate','2026-07-20','firstPayDate','2026-07-20','installments',0,'status','Vigente','note','Importado desde Excel','createdAt',now(),'updatedAt',now()),
      jsonb_build_object('id','PRE-00000010','code','00000010','clientId','CLI-00000010','disbursementDate','2026-06-21','principal',1000,'currency','PEN','interestRate',10,'interestType','Interes porcentual mensual','mode','Pago mensual','hasSchedule',false,'termDays',30,'estimatedPayDate','2026-07-21','firstPayDate','2026-07-21','installments',0,'status','Vigente','note','Importado desde Excel','createdAt',now(),'updatedAt',now()),
      jsonb_build_object('id','PRE-00000011','code','00000011','clientId','CLI-00000001','disbursementDate','2026-06-24','principal',2500,'currency','PEN','interestRate',10,'interestType','Interes porcentual mensual','mode','Pago mensual','hasSchedule',false,'termDays',30,'estimatedPayDate','2026-07-24','firstPayDate','2026-07-24','installments',0,'status','Vigente','note','Importado desde Excel','createdAt',now(),'updatedAt',now()),
      jsonb_build_object('id','PRE-00000012','code','00000012','clientId','CLI-00000012','disbursementDate','2026-06-30','principal',330,'currency','PEN','interestRate',100,'interestType','Interes porcentual mensual','mode','Pago mensual','hasSchedule',false,'termDays',30,'estimatedPayDate','2026-07-30','firstPayDate','2026-07-30','installments',0,'status','Vigente','note','Importado desde Excel','createdAt',now(),'updatedAt',now()),
      jsonb_build_object('id','PRE-00000013','code','00000013','clientId','CLI-00000013','disbursementDate','2026-06-28','principal',500,'currency','PEN','interestRate',10,'interestType','Interes porcentual mensual','mode','Pago mensual','hasSchedule',false,'termDays',30,'estimatedPayDate','2026-07-28','firstPayDate','2026-07-28','installments',0,'status','Vigente','note','Importado desde Excel','createdAt',now(),'updatedAt',now()),
      jsonb_build_object('id','PRE-00000014','code','00000014','clientId','CLI-00000005','disbursementDate','2026-06-30','principal',2000,'currency','PEN','interestRate',10,'interestType','Interes porcentual mensual','mode','Pago mensual','hasSchedule',false,'termDays',30,'estimatedPayDate','2026-07-30','firstPayDate','2026-07-30','installments',0,'status','Vigente','note','Importado desde Excel','createdAt',now(),'updatedAt',now()),
      jsonb_build_object('id','PRE-00000015','code','00000015','clientId','CLI-00000009','disbursementDate','2026-06-30','principal',2000,'currency','PEN','interestRate',10,'interestType','Interes porcentual mensual','mode','Pago mensual','hasSchedule',false,'termDays',30,'estimatedPayDate','2026-07-30','firstPayDate','2026-07-30','installments',0,'status','Vigente','note','Importado desde Excel','createdAt',now(),'updatedAt',now()),
      jsonb_build_object('id','PRE-00000016','code','00000016','clientId','CLI-00000010','disbursementDate','2026-06-30','principal',1000,'currency','PEN','interestRate',10,'interestType','Interes porcentual mensual','mode','Pago mensual','hasSchedule',false,'termDays',30,'estimatedPayDate','2026-07-30','firstPayDate','2026-07-30','installments',0,'status','Vigente','note','Importado desde Excel','createdAt',now(),'updatedAt',now())
    ),
    'payments', '[]'::jsonb,
    'users', '[]'::jsonb,
    'audit', jsonb_build_array(
      jsonb_build_object('id','AUD-IMPORT-20260701','action','Carga inicial Excel','detail','12 clientes y 16 prestamos cargados','user','sql.import','createdAt',now())
    )
  ),
  updated_at = now()
where id = 'main';

notify pgrst, 'reload schema';
select pg_notify('pgrst', 'reload schema');

select
  jsonb_array_length(data->'clients') as clientes,
  jsonb_array_length(data->'loans') as prestamos,
  jsonb_array_length(data->'payments') as pagos
from public.loan_app_state
where id = 'main';
