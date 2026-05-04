import { Entity, Column, PrimaryColumn, CreateDateColumn, Index } from 'typeorm';

@Entity('profiles')
@Index(['country_id', 'gender', 'age_group'])
export class Profile {
  @PrimaryColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column()
  @Index()
  gender: string;

  @Column('float')
  gender_probability: number;

  @Column('int')
  @Index()
  age: number;

  @Column()
  @Index()
  age_group: string;

  @Column({ length: 2 })
  @Index()
  country_id: string;

  @Column()
  country_name: string;

  @Column('float')
  country_probability: number;

  @CreateDateColumn()
  @Index()
  created_at: Date;
}
