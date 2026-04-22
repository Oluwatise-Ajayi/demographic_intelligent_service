import { Entity, Column, PrimaryColumn, CreateDateColumn } from 'typeorm';

@Entity('profiles')
export class Profile {
  @PrimaryColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column()
  gender: string;

  @Column('float')
  gender_probability: number;

  @Column('int')
  age: number;

  @Column()
  age_group: string;

  @Column({ length: 2 })
  country_id: string;

  @Column()
  country_name: string;

  @Column('float')
  country_probability: number;

  @CreateDateColumn()
  created_at: Date;
}
